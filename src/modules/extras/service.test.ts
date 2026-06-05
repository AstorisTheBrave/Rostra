import assert from "node:assert/strict";
import { test } from "node:test";
import { matchResponder } from "./service.ts";

const list = [
	{ trigger: "hello", response: "Hi!" },
	{ trigger: "gg", response: "Good game!" },
];

test("matchResponder finds a trigger substring (case-insensitive)", () => {
	assert.equal(matchResponder(list, "well HELLO there")?.response, "Hi!");
	assert.equal(matchResponder(list, "that was gg")?.response, "Good game!");
});

test("matchResponder returns undefined when nothing matches", () => {
	assert.equal(matchResponder(list, "nothing here"), undefined);
});
