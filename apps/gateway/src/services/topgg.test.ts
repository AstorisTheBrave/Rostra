import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyVoteAuth } from "./topgg.ts";

test("verifyVoteAuth accepts a matching secret", () => {
	assert.equal(verifyVoteAuth("secret", "secret"), true);
});

test("verifyVoteAuth rejects a wrong or missing header", () => {
	assert.equal(verifyVoteAuth("nope", "secret"), false);
	assert.equal(verifyVoteAuth(undefined, "secret"), false);
});

test("verifyVoteAuth rejects when no secret is configured", () => {
	assert.equal(verifyVoteAuth("anything", undefined), false);
});
