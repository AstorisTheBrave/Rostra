import assert from "node:assert/strict";
import { test } from "node:test";
import { EMOJI_FALLBACK, EMOJI_NAMES, emoji } from "./emojis.ts";

test("every registry name has a non-empty unicode fallback", () => {
	for (const name of EMOJI_NAMES) {
		assert.ok(EMOJI_FALLBACK[name].length > 0, `${name} has no fallback`);
	}
});

test("emoji() returns a custom application emoji or the unicode fallback", () => {
	// Robust to either state: ids populated (custom <:name:id>) or empty (fallback).
	for (const name of EMOJI_NAMES) {
		const value = emoji(name);
		const isCustom = new RegExp(`^<a?:${name}:\\d+>$`).test(value);
		assert.ok(
			isCustom || value === EMOJI_FALLBACK[name],
			`${name} -> ${value} is neither a custom emoji nor the fallback`,
		);
	}
});

test("EMOJI_NAMES matches the fallback keys", () => {
	assert.deepEqual([...EMOJI_NAMES].sort(), Object.keys(EMOJI_FALLBACK).sort());
});
