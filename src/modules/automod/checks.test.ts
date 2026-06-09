import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDisallowedLink, hasHateSpeech, hasInvite, isCapsAbuse } from "./checks.ts";

test("hasHateSpeech catches slurs through spacing, leet, and homoglyph bypasses", () => {
	assert.equal(hasHateSpeech("you are a r3t4rd"), true);
	assert.equal(hasHateSpeech("f a g g o t"), true);
	assert.equal(hasHateSpeech("normal friendly message"), false);
	assert.equal(hasHateSpeech("the assassin escaped"), false); // no false-positive on 'ass'
});

test("hasInvite detects discord invites", () => {
	assert.equal(hasInvite("join discord.gg/abc123"), true);
	assert.equal(hasInvite("https://discord.com/invite/xyz"), true);
	assert.equal(hasInvite("no invite here"), false);
});

test("hasDisallowedLink respects the allow-list", () => {
	assert.equal(hasDisallowedLink("visit https://evil.com/x", []), true);
	assert.equal(hasDisallowedLink("see https://youtube.com/v", ["youtube.com"]), false);
	assert.equal(hasDisallowedLink("see https://cdn.youtube.com/v", ["youtube.com"]), false);
	assert.equal(hasDisallowedLink("see https://evil.com", ["youtube.com"]), true);
	assert.equal(hasDisallowedLink("no links", ["youtube.com"]), false);
});

test("isCapsAbuse flags shouting but ignores short text", () => {
	assert.equal(isCapsAbuse("STOP SHOUTING RIGHT NOW", 70, 10), true);
	assert.equal(isCapsAbuse("hello everyone how are you", 70, 10), false);
	assert.equal(isCapsAbuse("OK", 70, 10), false);
});
