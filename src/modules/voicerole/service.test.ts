import assert from "node:assert/strict";
import { test } from "node:test";
import { voiceRoleAction } from "./service.ts";

test("voiceRoleAction adds on join and removes on leave", () => {
	assert.equal(voiceRoleAction(false, true), "add"); // joined voice
	assert.equal(voiceRoleAction(true, false), "remove"); // left voice
});

test("voiceRoleAction is a no-op for moves and non-voice updates", () => {
	assert.equal(voiceRoleAction(true, true), "none"); // moved channel / mute toggle
	assert.equal(voiceRoleAction(false, false), "none"); // not in voice at all
});
