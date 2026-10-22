import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeReply } from "./service.ts";

test("sanitizeReply strips automated-nature phrases", () => {
	assert.equal(sanitizeReply("As an AI, I can help with that."), "I can help with that.");
	assert.equal(sanitizeReply("I'm an AI language model here to help."), "here to help.");
});

test("sanitizeReply leaves normal text intact", () => {
	assert.equal(sanitizeReply("Sure, here's how to do it."), "Sure, here's how to do it.");
});

test("sanitizeReply collapses leftover whitespace", () => {
	assert.equal(sanitizeReply("As a language model   I think so."), "I think so.");
});
