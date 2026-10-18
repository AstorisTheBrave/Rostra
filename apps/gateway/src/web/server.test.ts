import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebServer } from "./server.ts";

test("gateway retains compatibility health, shard detail and metrics only", async (t) => {
	const app = await createWebServer({
		shardStats: async () => [
			{ id: 0, guilds: 2, ping: 10 },
			{ id: 1, guilds: 3, ping: 12 },
		],
	});
	t.after(() => app.close());
	assert.deepEqual((await app.inject({ method: "GET", url: "/health" })).json(), { status: "ok" });
	assert.deepEqual((await app.inject({ method: "GET", url: "/health/shards" })).json(), {
		shards: [
			{ id: 0, guilds: 2, ping: 10 },
			{ id: 1, guilds: 3, ping: 12 },
		],
		total: 5,
	});
	const metrics = (await app.inject({ method: "GET", url: "/metrics" })).json();
	assert.equal(typeof metrics.uptime, "number");
	assert.equal(typeof metrics.memoryMB, "number");
	assert.equal((await app.inject({ method: "POST", url: "/votes/topgg" })).statusCode, 404);
});
