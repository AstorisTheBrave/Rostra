import assert from "node:assert/strict";
import { test } from "node:test";
import { recordJoin } from "./raid.ts";

test("recordJoin fires once the threshold is met inside the window", () => {
	const g = "guild-burst";
	const t0 = 1_000_000;
	// 4 joins within a 10s window, threshold 5 -> no trigger yet
	assert.equal(recordJoin(g, 5, 10, t0 + 0), false);
	assert.equal(recordJoin(g, 5, 10, t0 + 1000), false);
	assert.equal(recordJoin(g, 5, 10, t0 + 2000), false);
	assert.equal(recordJoin(g, 5, 10, t0 + 3000), false);
	// 5th join still inside the window -> trigger
	assert.equal(recordJoin(g, 5, 10, t0 + 4000), true);
});

test("recordJoin drops joins outside the window", () => {
	const g = "guild-slow";
	const t0 = 2_000_000;
	assert.equal(recordJoin(g, 3, 10, t0), false);
	assert.equal(recordJoin(g, 3, 10, t0 + 5000), false);
	// 20s later the first two are stale; this is effectively the 1st in-window join
	assert.equal(recordJoin(g, 3, 10, t0 + 20_000), false);
});
