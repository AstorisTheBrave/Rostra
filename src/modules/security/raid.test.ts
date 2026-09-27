import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isCurrentRaidUnlock,
	recordJoin,
	restoreLockLevel,
	shouldRestoreLockLevel,
} from "./raid.ts";

test("panic restart recovery prefers durable original verification level", () => {
	assert.equal(restoreLockLevel(1, null), 1);
	assert.equal(restoreLockLevel(null, { active: true, restoreLevel: 2, unlockAt: 200 }), 2);
	assert.equal(restoreLockLevel(1, { active: true, restoreLevel: 2, unlockAt: 200 }), 1);
});

test("manual verification changes after a raid are not overwritten by auto-unlock", () => {
	assert.equal(shouldRestoreLockLevel(4, 1), true);
	assert.equal(shouldRestoreLockLevel(2, 1), false);
	assert.equal(shouldRestoreLockLevel(1, 1), false);
});

test("raid unlock ignores manually cleared, legacy, and newer lockdown generations", () => {
	const lock = { active: true as const, restoreLevel: 2, unlockAt: 200 };
	assert.equal(isCurrentRaidUnlock(200, lock), true);
	assert.equal(isCurrentRaidUnlock(100, lock), false);
	assert.equal(isCurrentRaidUnlock(200, null), false);
	assert.equal(isCurrentRaidUnlock(undefined, lock), false);
});

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
