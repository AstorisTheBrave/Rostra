import assert from "node:assert/strict";
import { test } from "node:test";
import { isTrusted } from "./service.ts";

const base = { botId: "bot", ownerId: "owner", extraOwners: ["eo"], whitelist: ["wl"] };

test("isTrusted recognises the bot, owner, extra owners, and whitelist", () => {
	assert.equal(isTrusted({ ...base, userId: "bot" }), true);
	assert.equal(isTrusted({ ...base, userId: "owner" }), true);
	assert.equal(isTrusted({ ...base, userId: "eo" }), true);
	assert.equal(isTrusted({ ...base, userId: "wl" }), true);
});

test("isTrusted rejects an unknown user", () => {
	assert.equal(isTrusted({ ...base, userId: "stranger" }), false);
});
