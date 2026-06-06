import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes, formatUptime } from "./stats.ts";

test("formatBytes scales KB/MB/GB", () => {
	assert.equal(formatBytes(512 * 1024), "512 KB");
	assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
	assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2.00 GB");
});

test("formatUptime renders compound durations and always shows seconds", () => {
	assert.equal(formatUptime(5), "5s");
	assert.equal(formatUptime(65), "1m 5s");
	assert.equal(formatUptime(3661), "1h 1m 1s");
	assert.equal(formatUptime(90_061), "1d 1h 1m 1s");
});
