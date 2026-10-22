import assert from "node:assert/strict";
import { test } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { hasModerationPermission } from "./permissions.ts";

test("moderation permission gate accepts only the guild permission", () => {
	const ownerWithoutPermission = { has: () => false };
	assert.equal(
		hasModerationPermission(ownerWithoutPermission, PermissionFlagsBits.BanMembers),
		false,
	);
	assert.equal(hasModerationPermission(null, PermissionFlagsBits.BanMembers), false);
	assert.equal(hasModerationPermission({ has: () => true }, PermissionFlagsBits.BanMembers), true);
});
