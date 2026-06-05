import assert from "node:assert/strict";
import { test } from "node:test";
import { truncate } from "./service.ts";

test("truncate leaves short strings unchanged", () => {
	assert.equal(truncate("hello", 100), "hello");
});

test("truncate shortens long strings with an ellipsis", () => {
	const result = truncate("a".repeat(50), 10);
	assert.equal(result.length, 10);
	assert.ok(result.endsWith("…"));
});
