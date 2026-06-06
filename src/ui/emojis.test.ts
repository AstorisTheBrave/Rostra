import assert from "node:assert/strict";
import { test } from "node:test";
import { EMOJI_FALLBACK, EMOJI_NAMES, emoji } from "./emojis.ts";

test("every registry name has a non-empty unicode fallback", () => {
	for (const name of EMOJI_NAMES) {
		assert.ok(EMOJI_FALLBACK[name].length > 0, `${name} has no fallback`);
	}
});

test("emoji() returns the unicode fallback when no id is configured", () => {
	// emoji-ids.json ships empty, so everything falls back to unicode.
	assert.equal(emoji("success"), EMOJI_FALLBACK.success);
	assert.equal(emoji("security"), "🛡️");
});

test("EMOJI_NAMES matches the fallback keys", () => {
	assert.deepEqual([...EMOJI_NAMES].sort(), Object.keys(EMOJI_FALLBACK).sort());
});
