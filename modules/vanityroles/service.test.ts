import assert from "node:assert/strict";
import { test } from "node:test";
import { statusMatches } from "./service.ts";

test("statusMatches finds the keyword case-insensitively", () => {
	assert.equal(statusMatches(["Playing a game", "join .GG/rostra now"], ".gg/rostra"), true);
	assert.equal(statusMatches([null, undefined, "hello"], "world"), false);
});

test("statusMatches handles empty input", () => {
	assert.equal(statusMatches([], "x"), false);
});
