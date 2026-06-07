import assert from "node:assert/strict";
import { test } from "node:test";
import { isStaffNote, relayBody } from "./service.ts";

test("relayBody formats a labelled line and appends attachments", () => {
	assert.equal(relayBody("Alice", "hello", []), "**Alice:** hello");
	assert.equal(
		relayBody("staff", "see this", ["https://cdn/x.png"]),
		"**staff:** see this\nhttps://cdn/x.png",
	);
});

test("relayBody falls back when there is no content", () => {
	assert.equal(relayBody("Bob", "   ", []), "**Bob:** *(no content)*");
	assert.equal(relayBody("Bob", "", ["https://cdn/a"]), "**Bob:** https://cdn/a");
});

test("isStaffNote detects the // prefix, ignoring leading space", () => {
	assert.equal(isStaffNote("// internal"), true);
	assert.equal(isStaffNote("   //note"), true);
	assert.equal(isStaffNote("hello //not a note"), false);
	assert.equal(isStaffNote("normal reply"), false);
});
