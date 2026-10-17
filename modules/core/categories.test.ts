import assert from "node:assert/strict";
import { test } from "node:test";
import { findCategory, HELP_CATEGORIES } from "./categories.ts";

test("category ids are unique and non-empty", () => {
	const ids = HELP_CATEGORIES.map((c) => c.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const c of HELP_CATEGORIES) {
		assert.ok(c.commands.length > 0, `${c.id} has no commands`);
		assert.ok(c.label.length > 0);
	}
});

test("each command appears in exactly one category", () => {
	const all = HELP_CATEGORIES.flatMap((c) => c.commands);
	assert.equal(new Set(all).size, all.length, "a command is listed in two categories");
});

test("findCategory resolves ids", () => {
	assert.equal(findCategory("music")?.label, "Music");
	assert.equal(findCategory("nope"), undefined);
});
