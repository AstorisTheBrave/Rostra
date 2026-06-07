import assert from "node:assert/strict";
import { test } from "node:test";
import type { VoteTally } from "./service.ts";

/**
 * The vote toggle logic lives in `castVote` (DB-backed). This mirrors its pure
 * decision so the rules are documented and checked without a database.
 */
function nextVote(existing: 1 | -1 | null, pressed: 1 | -1): 1 | -1 | null {
	if (existing === pressed) return null; // same direction clears the vote
	return pressed; // new or flipped
}

function applyTally(base: VoteTally, existing: 1 | -1 | null, pressed: 1 | -1): VoteTally {
	const next = nextVote(existing, pressed);
	const t = { ...base };
	if (existing === 1) t.up--;
	if (existing === -1) t.down--;
	if (next === 1) t.up++;
	if (next === -1) t.down++;
	return t;
}

test("pressing the same direction twice clears the vote", () => {
	assert.equal(nextVote(1, 1), null);
	assert.equal(nextVote(-1, -1), null);
});

test("pressing the opposite direction flips the vote", () => {
	assert.equal(nextVote(1, -1), -1);
	assert.equal(nextVote(-1, 1), 1);
});

test("a first vote is recorded as-is", () => {
	assert.equal(nextVote(null, 1), 1);
	assert.equal(nextVote(null, -1), -1);
});

test("tally moves correctly when flipping up -> down", () => {
	assert.deepEqual(applyTally({ up: 3, down: 1 }, 1, -1), { up: 2, down: 2 });
});

test("tally decrements when clearing a vote", () => {
	assert.deepEqual(applyTally({ up: 3, down: 1 }, 1, 1), { up: 2, down: 1 });
});
