import assert from "node:assert/strict";
import { test } from "node:test";
import { cooldownRemaining, formatCoins } from "./service.ts";

test("formatCoins adds the symbol and separators", () => {
	assert.equal(formatCoins(1500), "🪙 1,500");
	assert.equal(formatCoins(0), "🪙 0");
});

test("cooldownRemaining returns 0 when ready or no timestamp", () => {
	assert.equal(cooldownRemaining(null, 1000), 0);
	const old = new Date(Date.now() - 5000);
	assert.equal(cooldownRemaining(old, 1000), 0);
});

test("cooldownRemaining returns remaining ms when on cooldown", () => {
	const now = 10_000;
	const last = new Date(now - 400);
	assert.equal(cooldownRemaining(last, 1000, now), 600);
});
