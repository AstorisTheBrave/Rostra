import assert from "node:assert/strict";
import { test } from "node:test";
import { clampBio, isValidHex, isValidImageUrl, MAX_BIO, normalizeHex } from "./service.ts";

test("isValidHex accepts 6-digit hex with or without #", () => {
	assert.ok(isValidHex("#5865f2"));
	assert.ok(isValidHex("5865F2"));
	assert.ok(!isValidHex("#fff"));
	assert.ok(!isValidHex("notacolor"));
	assert.ok(!isValidHex("#12345g"));
});

test("normalizeHex lowercases and prefixes #", () => {
	assert.equal(normalizeHex("5865F2"), "#5865f2");
	assert.equal(normalizeHex("#ABCDEF"), "#abcdef");
});

test("isValidImageUrl requires https and an image extension", () => {
	assert.ok(isValidImageUrl("https://cdn.example.com/a.png"));
	assert.ok(isValidImageUrl("https://x.test/img.JPG"));
	assert.ok(!isValidImageUrl("http://x.test/a.png"));
	assert.ok(!isValidImageUrl("https://x.test/a.txt"));
	assert.ok(!isValidImageUrl("not a url"));
});

test("clampBio limits length to MAX_BIO", () => {
	assert.equal(clampBio("hello").length, 5);
	assert.equal(clampBio("x".repeat(500)).length, MAX_BIO);
});
