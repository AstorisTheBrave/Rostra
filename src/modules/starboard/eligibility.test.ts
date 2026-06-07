import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type AccessLists,
	isAllowed,
	netStars,
	parseDisplayTiers,
	passesFilters,
	resolveSettings,
	tierEmoji,
} from "./eligibility.ts";

const emptyLists: AccessLists = {
	blacklistUsers: [],
	blacklistRoles: [],
	blacklistChannels: [],
	whitelistUsers: [],
	whitelistRoles: [],
	whitelistChannels: [],
};

test("isAllowed: more specific whitelist beats less specific blacklist", () => {
	// role blacklisted but user whitelisted -> allowed (user is more specific)
	assert.equal(
		isAllowed(
			{ userId: "u1", roleIds: ["rBad"], channelId: "c1" },
			{ ...emptyLists, blacklistRoles: ["rBad"], whitelistUsers: ["u1"] },
		),
		true,
	);
	// user blacklisted but role whitelisted -> blocked (user more specific)
	assert.equal(
		isAllowed(
			{ userId: "u1", roleIds: ["rGood"], channelId: "c1" },
			{ ...emptyLists, blacklistUsers: ["u1"], whitelistRoles: ["rGood"] },
		),
		false,
	);
});

test("isAllowed: channel blacklist blocks, default allows", () => {
	assert.equal(
		isAllowed(
			{ userId: "u", roleIds: [], channelId: "cBad" },
			{ ...emptyLists, blacklistChannels: ["cBad"] },
		),
		false,
	);
	assert.equal(isAllowed({ userId: "u", roleIds: [], channelId: "c" }, emptyLists), true);
});

test("passesFilters enforces length, attachments, image, age, nsfw", () => {
	const base = {
		minChars: 0,
		minAttachments: 0,
		requireImage: false,
		maxMessageAgeHours: 0,
		requireNsfwChannel: false,
	};
	const facts = {
		contentLength: 50,
		attachmentCount: 1,
		hasImage: true,
		ageMs: 1000,
		channelNsfw: false,
	};
	assert.equal(passesFilters(facts, base), true);
	assert.equal(passesFilters(facts, { ...base, minChars: 100 }), false);
	assert.equal(passesFilters(facts, { ...base, minAttachments: 2 }), false);
	assert.equal(
		passesFilters({ ...facts, hasImage: false }, { ...base, requireImage: true }),
		false,
	);
	assert.equal(
		passesFilters({ ...facts, ageMs: 5 * 3_600_000 }, { ...base, maxMessageAgeHours: 1 }),
		false,
	);
	assert.equal(passesFilters(facts, { ...base, requireNsfwChannel: true }), false);
});

test("netStars subtracts downvotes, floors at 0, respects self/bot/blacklist", () => {
	const r = (id: string, bot = false, roleIds: string[] = []) => ({ id, bot, roleIds });
	assert.equal(
		netStars({
			upvoters: [r("a"), r("b"), r("c")],
			downvoters: [r("d")],
			authorId: "x",
			selfStar: false,
			filterBots: true,
			lists: emptyLists,
		}),
		2,
	);
	// more downvotes than upvotes -> floored at 0
	assert.equal(
		netStars({
			upvoters: [r("a")],
			downvoters: [r("b"), r("c")],
			authorId: "x",
			selfStar: false,
			filterBots: true,
			lists: emptyLists,
		}),
		0,
	);
	// author self-star excluded when selfStar off; bot excluded; blacklisted excluded
	assert.equal(
		netStars({
			upvoters: [r("author"), r("botto", true), r("blk"), r("ok")],
			downvoters: [],
			authorId: "author",
			selfStar: false,
			filterBots: true,
			lists: { ...emptyLists, blacklistUsers: ["blk"] },
		}),
		1,
	);
});

test("display tiers pick the highest threshold met", () => {
	const tiers = parseDisplayTiers("5:⭐ 10:🌟 25:💫");
	assert.deepEqual(tiers, [
		{ minStars: 5, emoji: "⭐" },
		{ minStars: 10, emoji: "🌟" },
		{ minStars: 25, emoji: "💫" },
	]);
	assert.equal(tierEmoji(3, tiers, "✨"), "✨"); // below all -> fallback
	assert.equal(tierEmoji(7, tiers, "✨"), "⭐");
	assert.equal(tierEmoji(30, tiers, "✨"), "💫");
});

test("resolveSettings: channel override beats role override beats base", () => {
	const base = { requiredStars: 5, removeStars: null, selfStar: false, filterBots: true };
	const overrides = [
		{
			scopeType: "role",
			scopeIds: ["r1"],
			enabled: true,
			requiredStars: 3,
			removeStars: null,
			selfStar: true,
			filterBots: null,
		},
		{
			scopeType: "channel",
			scopeIds: ["c1"],
			enabled: true,
			requiredStars: 10,
			removeStars: null,
			selfStar: null,
			filterBots: null,
		},
	];
	const res = resolveSettings(base, overrides, { channelId: "c1", roleIds: ["r1"] });
	assert.equal(res.requiredStars, 10); // channel wins over role(3) and base(5)
	assert.equal(res.selfStar, true); // from role override (channel didn't set it)
	// no matching context -> base unchanged
	assert.deepEqual(resolveSettings(base, overrides, { channelId: "cX", roleIds: [] }), base);
});
