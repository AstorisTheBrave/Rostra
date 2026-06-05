import assert from "node:assert/strict";
import { test } from "node:test";
import { formatName } from "./service.ts";

test("formatName substitutes the username", () => {
	assert.equal(formatName("{user}'s channel", "Ada"), "Ada's channel");
	assert.equal(formatName("Lounge", "Ada"), "Lounge");
});

test("formatName clamps to 100 characters", () => {
	assert.equal(formatName("{user}", "x".repeat(200)).length, 100);
});
