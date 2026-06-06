import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REMINDER_MS, parseDuration } from "./service.ts";

test("parseDuration handles single and compound units", () => {
	assert.equal(parseDuration("10m"), 600_000);
	assert.equal(parseDuration("1h"), 3_600_000);
	assert.equal(parseDuration("2d"), 172_800_000);
	assert.equal(parseDuration("1w"), 604_800_000);
	assert.equal(parseDuration("1h30m"), 5_400_000);
	assert.equal(parseDuration("1d12h"), 129_600_000);
});

test("parseDuration is case-insensitive and tolerates spaces", () => {
	assert.equal(parseDuration("1H 30M"), 5_400_000);
});

test("parseDuration returns null when nothing parses", () => {
	assert.equal(parseDuration(""), null);
	assert.equal(parseDuration("soon"), null);
	assert.equal(parseDuration("123"), null);
});

test("MAX_REMINDER_MS is 365 days", () => {
	assert.equal(MAX_REMINDER_MS, 365 * 86_400_000);
});
