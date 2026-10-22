import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCount, parseCount } from "./service.ts";

test("parseCount reads a leading integer, ignoring trailing text", () => {
	assert.equal(parseCount("5"), 5);
	assert.equal(parseCount("  42 nice"), 42);
	assert.equal(parseCount("hello"), null);
	assert.equal(parseCount("3.5"), 3); // leading int only
});

const cfg = (current: number, lastUserId: string | null, best = current) => ({
	current,
	best,
	lastUserId,
});

test("evaluateCount accepts the next number from a new counter", () => {
	assert.deepEqual(evaluateCount(cfg(4, "u1"), "u2", 5), { type: "accept", value: 5, best: true });
});

test("evaluateCount flags a new best only when surpassing it", () => {
	const r = evaluateCount(cfg(4, "u1", 10), "u2", 5);
	assert.deepEqual(r, { type: "accept", value: 5, best: false });
});

test("evaluateCount rejects the wrong number", () => {
	assert.deepEqual(evaluateCount(cfg(4, "u1"), "u2", 7), {
		type: "reject",
		reason: "wrong",
		expected: 5,
	});
});

test("evaluateCount rejects the same user counting twice in a row", () => {
	assert.deepEqual(evaluateCount(cfg(4, "u1"), "u1", 5), {
		type: "reject",
		reason: "double",
		expected: 5,
	});
});

test("evaluateCount ignores non-numeric messages", () => {
	assert.deepEqual(evaluateCount(cfg(4, "u1"), "u2", null), { type: "ignore" });
});
