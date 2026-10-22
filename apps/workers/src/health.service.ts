import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { createWorkerHealthRedis, createWorkerHealthServer } from "./health.ts";

test("worker readiness probes disposable PostgreSQL and Redis and reports failure", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for service integration");
	const redis = createWorkerHealthRedis(config.redis.url);
	redis.on("error", () => {});
	let database: () => Promise<unknown> = () => getPrisma().$queryRaw`SELECT 1`;
	let lastPollAt = Date.now();
	const server = createWorkerHealthServer({
		internalToken: config.api.internalToken,
		probeDatabase: () => database(),
		probeRedis: () => redis.ping(),
		closing: () => false,
		metrics: () => ({
			outbox: { lastSuccessAt: lastPollAt, lastPollOk: true },
			scheduler: { lastSuccessAt: lastPollAt, lastPollOk: true },
		}),
		probeTimeoutMs: 100,
	});
	try {
		await once(redis, "ready");
		await database();
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const ready = () => fetch(`http://127.0.0.1:${address.port}/health/ready`);
		assert.equal((await ready()).status, 200);
		lastPollAt = Date.now() - 16_000;
		assert.equal((await ready()).status, 503);
		lastPollAt = Date.now();
		database = () => getPrisma().$queryRaw`SELECT * FROM rostra_health_missing_table`;
		assert.equal((await ready()).status, 503);
		let databaseCalls = 0;
		let pendingDatabase: Promise<unknown> | undefined;
		database = () => {
			databaseCalls++;
			pendingDatabase = Promise.resolve(getPrisma().$queryRaw`SELECT 1 FROM pg_sleep(1)`);
			return pendingDatabase;
		};
		for (let round = 0; round < 2; round++) {
			const responses = await Promise.all([ready(), ready(), ready()]);
			assert.ok(responses.every((response) => response.status === 503));
			assert.equal(databaseCalls, 1);
		}
		await pendingDatabase;
		database = () => getPrisma().$queryRaw`SELECT 1`;
		const disconnected = once(redis, "end");
		redis.disconnect();
		await disconnected;
		const started = Date.now();
		for (let round = 0; round < 3; round++) {
			assert.equal((await ready()).status, 503);
		}
		assert.ok(Date.now() - started < 1_000);
		assert.equal((redis as unknown as { offlineQueue: { length: number } }).offlineQueue.length, 0);
		await redis.connect();
		assert.equal((await ready()).status, 200);
	} finally {
		server.close();
		redis.disconnect();
		await disconnectPrisma();
	}
});
