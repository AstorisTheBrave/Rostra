import assert from "node:assert/strict";
import { test } from "node:test";
import {
	fetchRoleplayGif,
	isRoleplayAction,
	isTargeted,
	ROLEPLAY_ACTIONS,
	shipBar,
	shipScore,
} from "./service.ts";

test("shipScore is deterministic and symmetric", () => {
	const a = shipScore("111", "222");
	assert.equal(a, shipScore("111", "222"));
	assert.equal(a, shipScore("222", "111"));
});

test("shipScore stays within 0-100", () => {
	const pairs: [string, string][] = [
		["1", "2"],
		["999999999", "1"],
		["424242", "424242"],
		["abc", "zzz"],
	];
	for (const [x, y] of pairs) {
		const s = shipScore(x, y);
		assert.ok(s >= 0 && s <= 100, `score ${s} out of range`);
	}
});

test("shipBar renders 10 heart segments", () => {
	const bar = shipBar(50);
	const hearts = [...bar.matchAll(/❤️|🤍/g)].length;
	assert.equal(hearts, 10);
	assert.equal([...shipBar(100).matchAll(/❤️/g)].length, 10);
	assert.equal([...shipBar(0).matchAll(/🤍/g)].length, 10);
});

test("action catalogue is within Discord's choice limit and well-formed", () => {
	const names = Object.keys(ROLEPLAY_ACTIONS);
	// 24 actions + the special "ship" choice = 25, Discord's max.
	assert.ok(names.length <= 24, `too many actions: ${names.length}`);
	for (const [name, a] of Object.entries(ROLEPLAY_ACTIONS)) {
		assert.ok(a.category.length > 0, `${name} missing category`);
		assert.ok(a.label.length > 0, `${name} missing label`);
		assert.equal(typeof a.targeted, "boolean");
	}
});

test("isRoleplayAction and isTargeted reflect the catalogue", () => {
	assert.ok(isRoleplayAction("hug"));
	assert.ok(!isRoleplayAction("nope"));
	assert.ok(isTargeted("hug"));
	assert.ok(!isTargeted("dance"));
});

test("fetchRoleplayGif returns a url on success and undefined on failure", async () => {
	const okFetch = (async () => ({
		ok: true,
		json: async () => ({ results: [{ url: "https://example.test/a.gif" }] }),
	})) as unknown as typeof fetch;
	assert.equal(await fetchRoleplayGif("hug", okFetch), "https://example.test/a.gif");

	const badStatus = (async () => ({
		ok: false,
		json: async () => ({}),
	})) as unknown as typeof fetch;
	assert.equal(await fetchRoleplayGif("hug", badStatus), undefined);

	const throwing = (async () => {
		throw new Error("network");
	}) as unknown as typeof fetch;
	assert.equal(await fetchRoleplayGif("hug", throwing), undefined);
});
