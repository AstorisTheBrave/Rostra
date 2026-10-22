import assert from "node:assert/strict";
import { test } from "node:test";
import { emojiCdnUrl, parseCustomEmojis, sanitizeEmojiName } from "./service.ts";

test("parseCustomEmojis extracts static and animated emojis", () => {
	const got = parseCustomEmojis("hi <:foo:123> and <a:bar:456>!");
	assert.deepEqual(got, [
		{ name: "foo", id: "123", animated: false },
		{ name: "bar", id: "456", animated: true },
	]);
});

test("parseCustomEmojis de-duplicates by id and ignores unicode emoji", () => {
	const got = parseCustomEmojis("<:foo:1> <:foo:1> 😀 plain text");
	assert.equal(got.length, 1);
	assert.equal(got[0]?.id, "1");
});

test("emojiCdnUrl picks gif for animated and png otherwise", () => {
	assert.equal(emojiCdnUrl("123", false), "https://cdn.discordapp.com/emojis/123.png");
	assert.equal(emojiCdnUrl("123", true), "https://cdn.discordapp.com/emojis/123.gif");
});

test("sanitizeEmojiName strips invalid chars and pads short names", () => {
	assert.equal(sanitizeEmojiName("hello world!"), "helloworld");
	assert.equal(sanitizeEmojiName("a"), "aemoji");
	assert.equal(sanitizeEmojiName("x".repeat(40)).length, 32);
});
