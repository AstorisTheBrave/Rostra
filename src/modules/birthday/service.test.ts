import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidDate, msUntilNextRun } from "./service.ts";

test("isValidDate validates day/month, allowing Feb 29", () => {
	assert.equal(isValidDate(29, 2), true);
	assert.equal(isValidDate(31, 4), false);
	assert.equal(isValidDate(0, 1), false);
	assert.equal(isValidDate(15, 13), false);
});

test("msUntilNextRun schedules the next UTC hour boundary", () => {
	const now = new Date("2026-06-05T08:00:00Z");
	assert.equal(msUntilNextRun(9, now), 60 * 60 * 1000);
	const afternoon = new Date("2026-06-05T10:00:00Z");
	assert.equal(msUntilNextRun(9, afternoon), 23 * 60 * 60 * 1000);
});
