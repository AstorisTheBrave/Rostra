import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebServer } from "./server.ts";

test("gateway public health is detail-free and diagnostics require host bearer", async (t) => {
	const app = await createWebServer({
		internalToken: "host-secret",
		shardStats: async () => [
			{ id: 0, guilds: 2, ping: 10 },
			{ id: 1, guilds: 3, ping: 12 },
		],
	});
	t.after(() => app.close());
	assert.deepEqual((await app.inject({ method: "GET", url: "/health" })).json(), { status: "ok" });
	assert.equal((await app.inject({ method: "GET", url: "/health/shards" })).statusCode, 404);
	assert.equal((await app.inject({ method: "GET", url: "/metrics" })).statusCode, 404);
	assert.equal(
		(await app.inject({ method: "GET", url: "/internal/health/shards" })).statusCode,
		401,
	);
	assert.equal(
		(
			await app.inject({
				method: "GET",
				url: "/internal/health/shards",
				headers: { authorization: "Bearer wrong" },
			})
		).statusCode,
		401,
	);
	assert.deepEqual(
		(
			await app.inject({
				method: "GET",
				url: "/internal/health/shards",
				headers: { authorization: "Bearer host-secret" },
			})
		).json(),
		{
			shards: [
				{ id: 0, guilds: 2, ping: 10 },
				{ id: 1, guilds: 3, ping: 12 },
			],
			total: 5,
		},
	);
	const metrics = (
		await app.inject({
			method: "GET",
			url: "/internal/metrics",
			headers: { authorization: "Bearer host-secret" },
		})
	).json();
	assert.equal(typeof metrics.uptime, "number");
	assert.equal(typeof metrics.memoryMB, "number");
	assert.equal((await app.inject({ method: "POST", url: "/votes/topgg" })).statusCode, 404);
});
