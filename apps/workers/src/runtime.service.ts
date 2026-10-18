import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "@rostra/config";
import { getPrisma } from "@rostra/database";
import {
	createAndPublishOperation,
	type OperationHandler,
	PrismaOperationRepository,
	RetryableOperationError,
} from "@rostra/operations";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { WorkerRuntime } from "./runtime.ts";

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
	await queue.obliterate({ force: true });
	const prisma = getPrisma();
	const repository = new PrismaOperationRepository();
	const key = `service-${Date.now()}`;
	const operation = await createAndPublishOperation(
		repository,
		{
			publish: (payload) => queue.add("operation", payload, { attempts: 1 }).then(() => undefined),
		},
		{ kind: "phase00.restart", idempotencyKey: key },
	);

	const firstConnection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const first = new WorkerRuntime(firstConnection);
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
	await first.drain();

	await queue.add("operation", { version: 1, operationId: operation.id }, { attempts: 1 });
	const secondConnection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const second = new WorkerRuntime(secondConnection);
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
	await waitFor(async () => (await repository.get(operation.id))?.status === "completed");
	assert.equal(await prisma.operationEffect.count({ where: { operationId: operation.id } }), 1);
	assert.equal(await prisma.operationAttempt.count({ where: { operationId: operation.id } }), 2);

	await second.drain();
	await prisma.operationRecord.delete({ where: { id: operation.id } });
	await queue.obliterate({ force: true });
	await queue.close();
	redis.disconnect();
});
