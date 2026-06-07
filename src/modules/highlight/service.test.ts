import assert from "node:assert/strict";
import { test } from "node:test";
import type { Highlight } from "@prisma/client";
import { resolveHits, wordMatches } from "./service.ts";

test("wordMatches is whole-word and case-insensitive", () => {
	assert.equal(wordMatches("I love Rostra a lot", "rostra"), true);
	assert.equal(wordMatches("RostraBot is here", "rostra"), false); // not a whole word
	assert.equal(wordMatches("ping me @rostra!", "rostra"), true); // punctuation boundary
	assert.equal(wordMatches("nothing here", "rostra"), false);
});

test("wordMatches escapes regex metacharacters", () => {
	assert.equal(wordMatches("price is c++ today", "c++"), true);
	assert.equal(wordMatches("a.b.c reference", "a.b.c"), true);
	assert.equal(wordMatches("axbxc reference", "a.b.c"), false);
});

const h = (userId: string, word: string): Highlight => ({
	id: `${userId}-${word}`,
	guildId: "g1",
	userId,
	word,
	createdAt: new Date(),
});

test("resolveHits excludes the author and matches subscribers once", () => {
	const list = [h("u1", "deploy"), h("u2", "deploy"), h("author", "deploy")];
	const hits = resolveHits(list, "time to deploy now", "author", "chanA");
	const ids = hits.map((x) => x.userId).sort();
	assert.deepEqual(ids, ["u1", "u2"]);
});

test("resolveHits returns nothing for empty content or no match", () => {
	const list = [h("u9", "alpha")];
	assert.deepEqual(resolveHits(list, "", "author", "chanZ"), []);
	assert.deepEqual(resolveHits(list, "beta gamma", "author", "chanZ"), []);
});
