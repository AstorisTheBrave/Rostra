import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import {
	BullMqOperationPublisher,
	createAndRelayOperation,
	OPERATION_PRODUCER_OPTIONS,
	operationJobId,
	PrismaOperationRepository,
} from "@rostra/operations";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { WorkerRuntime } from "../../apps/workers/src/runtime.ts";

const operationKind = "phase01.redis-recovery";
const operationKey = "phase01-real-redis-recovery";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for Redis recovery");
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
	}
}

async function seedDuringOutage(key: string): Promise<void> {
	assert(config.redis.url, "REDIS_URL is required for the Redis recovery proof");
	const repository = new PrismaOperationRepository();
	const connection = new Redis(config.redis.url, {
		...OPERATION_PRODUCER_OPTIONS,
		lazyConnect: true,
	});
	connection.on("error", () => {});
	const publisher = new BullMqOperationPublisher({
		...connection.options,
		...OPERATION_PRODUCER_OPTIONS,
	} as ConnectionOptions);
	try {
		const startedAt = performance.now();
		const result = await createAndRelayOperation(repository, publisher, {
			kind: operationKind,
			idempotencyKey: key,
		});
		assert.equal(result.delivery, "degraded");
		assert.ok(performance.now() - startedAt < 5_000, "Redis producer must fail promptly");
		const outbox = await getPrisma().operationOutbox.findUniqueOrThrow({
			where: { operationId: result.record.id },
		});
		assert.equal(result.record.status, "pending");
		assert.equal(outbox.status, "retryable");
		assert.equal(outbox.lastErrorCode, "publish_failed");
	} finally {
		await publisher.close().catch(() => undefined);
		connection.disconnect();
		await disconnectPrisma();
	}
}

async function recoverAfterRestart(key: string): Promise<void> {
	assert(config.redis.url, "REDIS_URL is required for the Redis recovery proof");
	const prisma = getPrisma();
	const repository = new PrismaOperationRepository();
	const operation = await prisma.operationRecord.findUniqueOrThrow({
		where: { idempotencyKey: key },
	});
	const workerRedis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queueRedis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", {
		connection: queueRedis as unknown as ConnectionOptions,
	});
	const runtime = new WorkerRuntime(workerRedis);
	const relayErrors: unknown[] = [];
	let recovered = false;
	try {
		runtime.registerOperations(
			repository,
			new Map([
				[
					operationKind,
					async () => {
						await repository.recordEffect(operation.id, { recovered: true });
					},
				],
			]),
		);
		runtime.registerOutboxRelay(repository, (error) => relayErrors.push(error), 50);
		await waitFor(async () => (await repository.get(operation.id))?.status === "completed");
		recovered = true;
		assert.deepEqual(relayErrors, []);
		assert.equal(await prisma.operationEffect.count({ where: { operationId: operation.id } }), 1);
		assert.equal(
			(await prisma.operationOutbox.findUniqueOrThrow({ where: { operationId: operation.id } }))
				.status,
			"published",
		);
	} finally {
		try {
			await runtime.drain();
			if (recovered) {
				await waitFor(async () => {
					const job = await queue.getJob(operationJobId(operation.id));
					return !job || (await job.getState()) === "completed";
				});
				await queue.getJob(operationJobId(operation.id)).then((job) => job?.remove());
			}
		} finally {
			await queue.close().catch(() => undefined);
			queueRedis.disconnect();
			try {
				await prisma.operationRecord.deleteMany({ where: { id: operation.id } });
			} finally {
				await disconnectPrisma();
			}
		}
	}
}

const mode = process.argv[2];
if (mode === "seed") await seedDuringOutage(operationKey);
else if (mode === "recover") await recoverAfterRestart(operationKey);
else throw new Error("usage: phase01-redis-recovery.service.ts <seed|recover>");
