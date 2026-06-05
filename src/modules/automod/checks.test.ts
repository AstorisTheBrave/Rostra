import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDisallowedLink, hasInvite, isCapsAbuse } from "./checks.ts";

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
