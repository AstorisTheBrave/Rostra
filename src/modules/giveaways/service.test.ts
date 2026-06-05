import assert from "node:assert/strict";
import { test } from "node:test";
import { pickWinners } from "./service.ts";

test("pickWinners returns the requested count of unique entries", () => {
	const entries = ["a", "b", "c", "d", "e"];
	const winners = pickWinners(entries, 3);
	assert.equal(winners.length, 3);
	assert.equal(new Set(winners).size, 3);
	for (const w of winners) assert.ok(entries.includes(w));
});

test("pickWinners caps at the number of entries and dedupes", () => {
	assert.equal(pickWinners(["a", "a", "b"], 5).length, 2);
	assert.deepEqual(pickWinners([], 3), []);
});
