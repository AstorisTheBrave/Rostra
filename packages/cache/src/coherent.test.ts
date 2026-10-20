import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCacheInvalidation } from "./bus.ts";
import { createCoherentCache } from "./coherent.ts";

test("two local caches converge after an invalidation and ignore older deliveries", async () => {
	let stored = 1;
	const first = createCoherentCache<number>("tenant", "guild");
	const second = createCoherentCache<number>("tenant", "guild");
	try {
		assert.equal(await first.get("g1", async () => stored), 1);
		assert.equal(await second.get("g1", async () => stored), 1);
		stored = 2;
		first.set("g1", 2, "2");
		second.invalidate({
			schemaVersion: 1,
			owner: "tenant",
			tenant: "guild:g1",
			key: "g1",
			version: "2",
		});
		assert.equal(await second.get("g1", async () => stored), 2);
		second.invalidate({
			schemaVersion: 1,
			owner: "tenant",
			tenant: "guild:g1",
			key: "g1",
			version: "1",
		});
		assert.equal(await second.get("g1", async () => 3), 2);
	} finally {
		first.dispose();
		second.dispose();
	}
});

test("invalid envelopes and mismatched scopes are rejected", () => {
	const valid = {
		schemaVersion: 1 as const,
		owner: "tenant",
		tenant: "guild:g1",
		key: "g1",
		version: "1",
	};
	for (const bad of [
		{ ...valid, schemaVersion: 2 },
		{ ...valid, tenant: "" },
		{ ...valid, key: "" },
		{ ...valid, version: "0" },
		{ ...valid, version: "1.5" },
		{ ...valid, owner: "" },
	])
		assert.equal(parseCacheInvalidation(bad), null);
	const cache = createCoherentCache<number>("tenant", "guild");
	try {
		assert.equal(cache.invalidate({ ...valid, tenant: "guild:g2" }), false);
		assert.equal(cache.invalidate({ ...valid, owner: "other" }), false);
		assert.equal(cache.invalidate({ ...valid, key: "g2" }), false);
	} finally {
		cache.dispose();
	}
});

test("local cache expires at the default 300-second fallback TTL", async () => {
	let now = 0;
	let value = 1;
	const cache = createCoherentCache<number>("tenant", "guild", { now: () => now });
	try {
		assert.equal(await cache.get("g1", async () => value), 1);
		value = 2;
		now = 299_999;
		assert.equal(await cache.get("g1", async () => value), 1);
		now = 300_000;
		assert.equal(await cache.get("g1", async () => value), 2);
	} finally {
		cache.dispose();
	}
});

test("an invalidation during loading causes a guarded reload", async () => {
	const cache = createCoherentCache<number>("tenant", "guild");
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let calls = 0;
	try {
		const pending = cache.get("g1", async () => {
			calls++;
			if (calls === 1) {
				await gate;
				return 1;
			}
			return 2;
		});
		cache.invalidate({
			schemaVersion: 1,
			owner: "tenant",
			tenant: "guild:g1",
			key: "g1",
			version: "1",
		});
		release?.();
		assert.equal(await pending, 2);
		assert.equal(calls, 2);
	} finally {
		cache.dispose();
	}
});
