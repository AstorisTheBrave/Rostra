import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTemplate, defaultTemplate, isStatType } from "./service.ts";

test("applyTemplate substitutes {count} with a formatted number", () => {
	assert.equal(applyTemplate("Members: {count}", 1234), "Members: 1,234");
	assert.equal(applyTemplate("{count} online", 5), "5 online");
});

test("applyTemplate clamps to 100 chars", () => {
	const long = `${"a".repeat(120)}{count}`;
	assert.equal(applyTemplate(long, 1).length, 100);
});

test("isStatType validates known types", () => {
	assert.equal(isStatType("members"), true);
	assert.equal(isStatType("boosts"), true);
	assert.equal(isStatType("nonsense"), false);
});

test("defaultTemplate always contains the {count} placeholder", () => {
	for (const type of ["members", "online", "boosts", "channels", "roles"] as const) {
		assert.ok(defaultTemplate(type).includes("{count}"));
	}
});
