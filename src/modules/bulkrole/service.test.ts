import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesFilter } from "./service.ts";

test("matchesFilter humans excludes bots", () => {
	assert.equal(matchesFilter(false, "humans"), true);
	assert.equal(matchesFilter(true, "humans"), false);
});

test("matchesFilter bots excludes humans", () => {
	assert.equal(matchesFilter(true, "bots"), true);
	assert.equal(matchesFilter(false, "bots"), false);
});

test("matchesFilter all matches everyone", () => {
	assert.equal(matchesFilter(true, "all"), true);
	assert.equal(matchesFilter(false, "all"), true);
});
