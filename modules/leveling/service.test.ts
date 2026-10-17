import assert from "node:assert/strict";
import { test } from "node:test";
import { levelFromXp, levelProgress, totalXpForLevel } from "./service.ts";

test("totalXpForLevel follows the curve", () => {
	assert.equal(totalXpForLevel(0), 0);
	assert.equal(totalXpForLevel(1), 100);
	assert.equal(totalXpForLevel(2), 300);
	assert.equal(totalXpForLevel(3), 600);
});

test("levelFromXp finds the right level", () => {
	assert.equal(levelFromXp(0), 0);
	assert.equal(levelFromXp(99), 0);
	assert.equal(levelFromXp(100), 1);
	assert.equal(levelFromXp(299), 1);
	assert.equal(levelFromXp(300), 2);
});

test("levelProgress reports progress into the current level", () => {
	const p = levelProgress(150);
	assert.equal(p.level, 1);
	assert.equal(p.into, 50);
	assert.equal(p.needed, 200);
});
