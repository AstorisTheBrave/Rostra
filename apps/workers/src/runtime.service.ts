import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import {
	BullMqOperationPublisher,
	createAndRelayOperation,
	IdempotencyConflictError,
	OPERATION_PRODUCER_OPTIONS,
	type OperationHandler,
	operationJobId,
	PrismaOperationRepository,
	RetryableOperationError,
} from "@rostra/operations";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { OutboxRelay, WorkerRuntime } from "./runtime.ts";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for service state");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

test("PostgreSQL intent and Redis redelivery survive a worker restart with one durable effect", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for service integration");
	const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", {
		connection: redis as unknown as ConnectionOptions,
	});
	const prisma = getPrisma();
	const repository = new PrismaOperationRepository();
	const operationIds: string[] = [];
	let first: WorkerRuntime | undefined;
	let second: WorkerRuntime | undefined;
	try {
		await queue.obliterate({ force: true });
		const key = `service-${Date.now()}`;
		const { record: operation } = await createAndRelayOperation(
			repository,
			{
				publish: (payload) =>
					queue
						.add("operation", payload, {
							attempts: 1,
							jobId: operationJobId(payload.operationId),
							removeOnFail: false,
						})
						.then(() => undefined),
			},
			{ kind: "phase00.restart", idempotencyKey: key },
		);
		operationIds.push(operation.id);
		await assert.rejects(
			repository.create({ kind: "other", idempotencyKey: key }),
			IdempotencyConflictError,
		);

		const firstConnection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
		first = new WorkerRuntime(firstConnection);
		first.registerOperations(
			repository,
			new Map<string, OperationHandler>([
				[
					"phase00.restart",
					async (record) => {
						await repository.recordEffect(record.id, { result: "once" });
						throw new RetryableOperationError("simulated_interruption");
					},
				],
			]),
		);
		await waitFor(async () => (await repository.get(operation.id))?.status === "retryable");
		await waitFor(
			async () =>
				(await queue.getJob(operationJobId(operation.id)))
					?.getState()
					.then((state) => state === "failed") ?? false,
		);
		await first.drain();
		first = undefined;

		const secondConnection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
		second = new WorkerRuntime(secondConnection);
		const reconciliationErrors: unknown[] = [];
		second.registerOperations(
			repository,
			new Map<string, OperationHandler>([
				[
					"phase00.restart",
					async (record) => {
						await repository.recordEffect(record.id, { result: "once" });
					},
				],
			]),
		);
		second.registerReconciler(repository, (error) => reconciliationErrors.push(error), 50);
		await waitFor(async () => (await repository.get(operation.id))?.status === "completed");
		assert.deepEqual(reconciliationErrors, []);
		assert.equal(await prisma.operationEffect.count({ where: { operationId: operation.id } }), 1);
		assert.equal(await prisma.operationAttempt.count({ where: { operationId: operation.id } }), 2);
		await second.drain();
		second = undefined;

		const fenced = await repository.create({
			kind: "phase00.fencing",
			idempotencyKey: `${key}-fencing`,
		});
		operationIds.push(fenced.record.id);
		const firstClaim = await repository.claim(fenced.record.id, new Date(0), 1);
		const secondClaim = await repository.claim(fenced.record.id, new Date(2), 1);
		assert.equal(firstClaim.state, "claimed");
		assert.equal(secondClaim.state, "claimed");
		if (firstClaim.state === "claimed" && secondClaim.state === "claimed") {
			assert.equal(
				await repository.complete(fenced.record.id, secondClaim.record.claimVersion),
				true,
			);
			assert.equal(
				await repository.fail(fenced.record.id, firstClaim.record.claimVersion, {
					classification: "retryable",
					code: "stale_worker",
				}),
				false,
			);
		}
	} finally {
		await Promise.allSettled([first?.drain(), second?.drain()]);
		if (operationIds.length)
			await prisma.operationRecord.deleteMany({ where: { id: { in: operationIds } } });
		await queue.obliterate({ force: true }).catch(() => undefined);
		await queue.close().catch(() => undefined);
		redis.disconnect();
		await disconnectPrisma();
	}
});

test("outbox relay reclaims publication without settlement and BullMQ keeps one job identity", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for service integration");
	const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", { connection: redis as unknown as ConnectionOptions });
	const publisher = new BullMqOperationPublisher({
		...redis.options,
		...OPERATION_PRODUCER_OPTIONS,
	} as ConnectionOptions);
	const repository = new PrismaOperationRepository();
	const prisma = getPrisma();
	let runtime: WorkerRuntime | undefined;
	let operationId: string | undefined;
	try {
		await queue.obliterate({ force: true });
		const created = await repository.create({
			kind: "phase01.outbox",
			idempotencyKey: `outbox-service-${Date.now()}`,
		});
		operationId = created.record.id;
		const first = await repository.claimOutbox(operationId, new Date(), 30_000);
		assert.ok(first);
		await publisher.publish({ version: 1, operationId });
		assert.equal(
			(await prisma.operationOutbox.findUniqueOrThrow({ where: { operationId } })).status,
			"claimed",
		);
		const relay = new OutboxRelay(repository, publisher);
		assert.equal(await relay.runOnce(new Date(Date.now() + 31_000)), 1);
		const settled = await prisma.operationOutbox.findUniqueOrThrow({ where: { operationId } });
		assert.equal(settled.status, "published");
		assert.equal(settled.claimVersion, first.claimVersion + 1);
		assert.equal(settled.attempts, 2);
		assert.equal(
			await repository.publishOutbox(operationId, first.claimVersion, new Date()),
			false,
		);
		assert.ok(await queue.getJob(operationJobId(operationId)));
		const workerConnection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
		runtime = new WorkerRuntime(workerConnection);
		runtime.registerOperations(
			repository,
			new Map<string, OperationHandler>([
				[
					"phase01.outbox",
					async (record) => {
						await repository.recordEffect(record.id, { ok: true });
					},
				],
			]),
		);
		await waitFor(
			async () => (await repository.get(operationId as string))?.status === "completed",
		);
		await publisher.publish({ version: 1, operationId });
		await waitFor(
			async () => (await prisma.operationEffect.count({ where: { operationId } })) === 1,
		);
		assert.equal(await prisma.operationEffect.count({ where: { operationId } }), 1);
	} finally {
		await runtime?.drain();
		if (operationId) await prisma.operationRecord.deleteMany({ where: { id: operationId } });
		await queue.obliterate({ force: true }).catch(() => undefined);
		await publisher.close().catch(() => undefined);
		await queue.close().catch(() => undefined);
		redis.disconnect();
		await disconnectPrisma();
	}
});

test("relay repairs operations created by a rolled-back image after the outbox migration", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for service integration");
	const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", { connection: redis as unknown as ConnectionOptions });
	const publisher = new BullMqOperationPublisher({
		...redis.options,
		...OPERATION_PRODUCER_OPTIONS,
	} as ConnectionOptions);
	const repository = new PrismaOperationRepository();
	const prisma = getPrisma();
	let operationId: string | undefined;
	try {
		await queue.obliterate({ force: true });
		const oldImageRecord = await prisma.operationRecord.create({
			data: {
				kind: "phase01.rollback-repair",
				idempotencyKey: `rollback-repair-${Date.now()}`,
				payload: {},
			},
		});
		operationId = oldImageRecord.id;
		assert.equal(await prisma.operationOutbox.count({ where: { operationId } }), 0);
		const relay = new OutboxRelay(repository, publisher);
		assert.equal(await relay.runOnce(), 1);
		assert.equal(
			(await prisma.operationOutbox.findUniqueOrThrow({ where: { operationId } })).status,
			"published",
		);
		assert.ok(await queue.getJob(operationJobId(operationId)));
		assert.equal(await relay.runOnce(), 0);
		assert.equal(await prisma.operationOutbox.count({ where: { operationId } }), 1);
	} finally {
		if (operationId) await prisma.operationRecord.deleteMany({ where: { id: operationId } });
		await queue.obliterate({ force: true }).catch(() => undefined);
		await publisher.close().catch(() => undefined);
		await queue.close().catch(() => undefined);
		redis.disconnect();
		await disconnectPrisma();
	}
});
