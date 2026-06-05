import assert from "node:assert/strict";
import { test } from "node:test";

test("cache get/set/del works with in-memory fallback (no REDIS_URL)", async () => {
	const { cacheSet, cacheGet, cacheDel } = await import("./cache.ts");
	await cacheSet("k1", { n: 1 }, 1000);
	assert.deepEqual(await cacheGet<{ n: number }>("k1"), { n: 1 });
	await cacheDel("k1");
	assert.equal(await cacheGet("k1"), undefined);
});

test("withCache computes once then serves cached", async () => {
	const { withCache } = await import("./cache.ts");
	let calls = 0;
	const fn = async () => {
		calls++;
		return 42;
	};
	assert.equal(await withCache("wc", 1000, fn), 42);
	assert.equal(await withCache("wc", 1000, fn), 42);
	assert.equal(calls, 1);
});
