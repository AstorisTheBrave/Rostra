import assert from "node:assert/strict";
import { test } from "node:test";

test("cooldown allows first use and blocks within the window", async () => {
	const { consume } = await import("./cooldown.ts");
	const key = `t:${Math.random()}`;
	const first = await consume(key, 1000);
	assert.equal(first.ok, true);
	const second = await consume(key, 1000);
	assert.equal(second.ok, false);
	assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= 1000);
});

test("cooldown allows again after the window expires", async () => {
	const { consume } = await import("./cooldown.ts");
	const key = `t:${Math.random()}`;
	assert.equal((await consume(key, 20)).ok, true);
	await new Promise((r) => setTimeout(r, 30));
	assert.equal((await consume(key, 20)).ok, true);
});
