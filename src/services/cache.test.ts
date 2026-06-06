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

test("CONFIG_TTL_MS is 5 minutes", async () => {
	const { CONFIG_TTL_MS } = await import("./cache.ts");
	assert.equal(CONFIG_TTL_MS, 300_000);
});

test("cachedConfig caches and invalidateConfig forces a reload", async () => {
	const { cachedConfig, invalidateConfig } = await import("./cache.ts");
	const key = `test:cfg:${Math.random().toString(36).slice(2)}`;
	let calls = 0;
	const loader = async () => ({ n: ++calls });

	assert.deepEqual(await cachedConfig(key, loader), { n: 1 });
	assert.deepEqual(await cachedConfig(key, loader), { n: 1 });
	assert.equal(calls, 1, "served from cache");

	await invalidateConfig(key);
	assert.deepEqual(await cachedConfig(key, loader), { n: 2 }, "reloads after invalidation");
	await invalidateConfig(key);
});
