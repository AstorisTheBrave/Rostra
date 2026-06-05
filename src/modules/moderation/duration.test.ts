import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, parseDuration } from "./duration.ts";

test("parseDuration handles single units", () => {
	assert.equal(parseDuration("10m"), 600_000);
	assert.equal(parseDuration("1h"), 3_600_000);
	assert.equal(parseDuration("2d"), 172_800_000);
});

test("parseDuration sums combined units", () => {
	assert.equal(parseDuration("1h30m"), 5_400_000);
	assert.equal(parseDuration("1d 2h"), 93_600_000);
});

test("parseDuration returns null for invalid input", () => {
	assert.equal(parseDuration("soon"), null);
	assert.equal(parseDuration(""), null);
});

test("formatDuration produces compact output", () => {
	assert.equal(formatDuration(5_400_000), "1h 30m");
	assert.equal(formatDuration(0), "0s");
	assert.equal(formatDuration(90_000), "1m 30s");
});
