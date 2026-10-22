import assert from "node:assert/strict";
import { test } from "node:test";
import { compactNumber, type ProfileStats, statLine } from "./stats.ts";

test("compactNumber abbreviates thousands and millions", () => {
	assert.equal(compactNumber(0), "0");
	assert.equal(compactNumber(999), "999");
	assert.equal(compactNumber(1000), "1k");
	assert.equal(compactNumber(1500), "1.5k");
	assert.equal(compactNumber(2_000_000), "2M");
	assert.equal(compactNumber(2_300_000), "2.3M");
});

test("statLine includes rank only when present", () => {
	const base: ProfileStats = { level: 12, xp: 9999, levelRank: 3, netWorth: 4200, ecoRank: 1 };
	assert.equal(statLine(base), "Level 12  ·  Rank #3  ·  4.2k coins");

	const noRank: ProfileStats = { ...base, levelRank: null };
	assert.equal(statLine(noRank), "Level 12  ·  4.2k coins");
});
