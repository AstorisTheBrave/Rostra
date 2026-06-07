import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveStarCount, emojiDisplay, parseStarEmoji, reactionKey } from "./service.ts";

test("parseStarEmoji keeps unicode and extracts custom emoji ids", () => {
	assert.equal(parseStarEmoji("⭐"), "⭐");
	assert.equal(parseStarEmoji("<:star:123456789>"), "123456789");
	assert.equal(parseStarEmoji("<a:spin:987654321>"), "987654321");
});

test("reactionKey uses id for custom emoji, name for unicode", () => {
	assert.equal(reactionKey({ id: "123", name: "star" }), "123");
	assert.equal(reactionKey({ id: null, name: "⭐" }), "⭐");
});

test("emojiDisplay renders a stored custom id back to an emoji form", () => {
	assert.equal(emojiDisplay("⭐"), "⭐");
	assert.match(emojiDisplay("123456789"), /^<:star:123456789>$/);
});

test("effectiveStarCount excludes bots and self-stars per config", () => {
	const users = [
		{ id: "author", bot: false },
		{ id: "u1", bot: false },
		{ id: "u2", bot: false },
		{ id: "botto", bot: true },
	];
	// self-stars off, bots ignored: author and bot excluded -> 2
	assert.equal(
		effectiveStarCount(users, { authorId: "author", selfStar: false, ignoreBots: true }),
		2,
	);
	// self-stars on, bots ignored: author counts -> 3
	assert.equal(
		effectiveStarCount(users, { authorId: "author", selfStar: true, ignoreBots: true }),
		3,
	);
	// self-stars on, bots counted: all 4
	assert.equal(
		effectiveStarCount(users, { authorId: "author", selfStar: true, ignoreBots: false }),
		4,
	);
});
