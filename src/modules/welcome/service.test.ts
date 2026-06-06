import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMessage } from "./service.ts";

const ctx = { user: "<@1>", username: "Ada", server: "Rostra HQ", memberCount: 42 };

test("formatMessage replaces all placeholders", () => {
	assert.equal(
		formatMessage("Hi {user} ({username}) - welcome to {server}, member #{membercount}", ctx),
		"Hi <@1> (Ada) - welcome to Rostra HQ, member #42",
	);
});

test("formatMessage leaves unknown placeholders untouched", () => {
	assert.equal(formatMessage("Hello {user} {unknown}", ctx), "Hello <@1> {unknown}");
});
