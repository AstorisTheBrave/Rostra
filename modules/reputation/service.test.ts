import assert from "node:assert/strict";
import { test } from "node:test";
import { cooldownRemaining, GIVE_COOLDOWN_MS } from "./service.ts";

test("cooldownRemaining is 0 when never given", () => {
	assert.equal(cooldownRemaining(null), 0);
});

test("cooldownRemaining is 0 once the window has passed", () => {
	const now = Date.now();
	const long = new Date(now - GIVE_COOLDOWN_MS - 1000);
	assert.equal(cooldownRemaining(long, now), 0);
});

test("cooldownRemaining counts down within the window", () => {
	const now = Date.now();
	const recent = new Date(now - 60_000);
	assert.equal(cooldownRemaining(recent, now), GIVE_COOLDOWN_MS - 60_000);
});
