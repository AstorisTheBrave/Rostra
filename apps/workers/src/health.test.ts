import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createTcpServer, type Socket } from "node:net";
import { test } from "node:test";
import * as health from "./health.ts";
import { createWorkerHealthServer, eventLoopDelayP95Ms } from "./health.ts";

test("health Redis rejects offline commands and bounds commands on an unresponsive socket", async (t) => {
	const sockets = new Set<Socket>();
	let answerPing = false;
	let receivedPings = 0;
	const endpoint = createTcpServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("data", (data) => {
			const commands = data
				.toString()
				.split(/(?=\*\d+\r\n)/)
				.filter(Boolean);
			for (const command of commands) {
				if (command.includes("\r\nping\r\n")) {
					receivedPings++;
					if (answerPing) socket.write("+PONG\r\n");
				} else socket.write("+OK\r\n");
			}
		});
	});
	endpoint.listen(0, "127.0.0.1");
	await once(endpoint, "listening");
	t.after(() => {
		for (const socket of sockets) socket.destroy();
		endpoint.close();
	});
	const address = endpoint.address();
	assert.ok(address && typeof address !== "string");
	const redis = health.createWorkerHealthRedis(`redis://127.0.0.1:${address.port}`);
	redis.on("error", () => {});
	t.after(() => redis.disconnect());
	const ready = once(redis, "ready");
	await assert.rejects(redis.ping(), /enableOfflineQueue/);
	await ready;
	const socket = [...sockets][0];
	assert.ok(socket);
	const socketClosed = once(socket, "close");
	const started = Date.now();
	await assert.rejects(redis.ping(), /Command timed out|Socket timeout/);
	assert.ok(Date.now() - started < 2_000);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			socketClosed,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Health socket must close after timeout")), 500);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
	answerPing = true;
	await once(redis, "ready");
	assert.equal(await redis.ping(), "PONG");
	assert.equal(receivedPings, 2, "timed-out commands must not replay after socket recovery");
	const ended = once(redis, "end");
	redis.disconnect();
	await ended;
	for (let attempt = 0; attempt < 3; attempt++) {
		await assert.rejects(redis.ping());
	}
	assert.equal((redis as unknown as { offlineQueue: { length: number } }).offlineQueue.length, 0);
	await redis.connect();
	assert.equal(await redis.ping(), "PONG");
	assert.equal(receivedPings, 3, "offline commands must not replay after reconnect");
});

test("event-loop diagnostics report the 95th percentile in milliseconds", () => {
	let requested = 0;
	assert.equal(
		eventLoopDelayP95Ms((percentile) => {
			requested = percentile;
			return 12_500_000;
		}),
		12.5,
	);
	assert.equal(requested, 95);
	assert.equal(
		eventLoopDelayP95Ms(() => Number.NaN),
		0,
	);
});

test("readiness retains one dependency probe after concurrent requests time out", async (t) => {
	let databaseCalls = 0;
	let redisCalls = 0;
	let releaseDatabase: (() => void) | undefined;
	let releaseRedis: (() => void) | undefined;
	const database = new Promise<void>((resolve) => {
		releaseDatabase = resolve;
	});
	const redis = new Promise<void>((resolve) => {
		releaseRedis = resolve;
	});
	const server = createWorkerHealthServer({
		probeDatabase: () => {
			databaseCalls++;
			return database;
		},
		probeRedis: () => {
			redisCalls++;
			return redis;
		},
		closing: () => false,
		metrics: () => ({
			outbox: { lastSuccessAt: 19_000, lastPollOk: true },
			scheduler: { lastSuccessAt: 19_000, lastPollOk: true },
		}),
		now: () => 20_000,
		probeTimeoutMs: 20,
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => server.close());
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const ready = () => fetch(`http://127.0.0.1:${address.port}/health/ready`);
	for (let round = 0; round < 3; round++) {
		const responses = await Promise.all([ready(), ready(), ready()]);
		assert.ok(responses.every((response) => response.status === 503));
		assert.equal(databaseCalls, 1, "pending database work must not accumulate");
		assert.equal(redisCalls, 1, "pending Redis work must not accumulate");
	}
	releaseDatabase?.();
	releaseRedis?.();
	assert.equal((await ready()).status, 200);
	assert.equal(databaseCalls, 2, "settled database probes must allow a fresh check");
	assert.equal(redisCalls, 2, "settled Redis probes must allow a fresh check");
});

test("worker health is detail-free, host-only, and bounded across failure states", async (t) => {
	let now = 20_000;
	let closing = false;
	let database = async () => {};
	let redis = async () => {};
	const outbox = 19_000;
	const scheduler = 19_000;
	const server = createWorkerHealthServer({
		internalToken: "host-secret",
		probeDatabase: () => database(),
		probeRedis: () => redis(),
		closing: () => closing,
		metrics: () => ({
			outbox: { lastSuccessAt: outbox, lastPollOk: true },
			scheduler: { lastSuccessAt: scheduler, lastPollOk: true },
			queueLagMs: 7,
		}),
		now: () => now,
		probeTimeoutMs: 20,
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => server.close());
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const get = async (path: string, authorization?: string) =>
		fetch(`http://127.0.0.1:${address.port}${path}`, {
			headers: authorization ? { authorization } : {},
		});
	assert.deepEqual(await (await get("/health/live")).json(), { status: "ok" });
	assert.deepEqual(await (await get("/health/ready")).json(), { status: "ready" });
	assert.equal((await get("/internal/diagnostics")).status, 401);
	assert.equal((await get("/internal/diagnostics", "Bearer wrong")).status, 401);
	assert.equal((await get("/internal/diagnostics", "Bearer host-secret")).status, 200);
	assert.equal(
		(await get("/internal/diagnostics", "Bearer host-secret")).headers.get("content-type"),
		"application/json",
	);
	now = 40_000;
	assert.equal((await get("/health/ready")).status, 503);
	now = 20_000;
	closing = true;
	assert.equal((await get("/health/ready")).status, 503);
	closing = false;
	database = async () => {
		throw new Error("private database detail");
	};
	assert.deepEqual(await (await get("/health/ready")).json(), { status: "not_ready" });
	database = async () => {};
	redis = async () => {
		throw new Error("private redis detail");
	};
	assert.equal((await get("/health/ready")).status, 503);
	redis = async () => new Promise<void>(() => {});
	const started = Date.now();
	assert.equal((await get("/health/ready")).status, 503);
	assert.ok(Date.now() - started < 500);
	assert.equal(outbox, 19_000);
	assert.equal(scheduler, 19_000);
});
