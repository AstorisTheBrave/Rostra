import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactionRolePanel } from "@prisma/client";
import { parseRoles } from "./service.ts";

function panel(roles: unknown): ReactionRolePanel {
	return {
		id: "p",
		guildId: "g",
		channelId: null,
		messageId: null,
		title: "t",
		mode: "multiple",
		roles,
		createdAt: new Date(),
	} as ReactionRolePanel;
}

test("parseRoles returns valid role objects", () => {
	const roles = parseRoles(
		panel([
			{ roleId: "1", label: "Red" },
			{ roleId: "2", label: "Blue", emoji: "🔵" },
		]),
	);
	assert.equal(roles.length, 2);
	assert.equal(roles[1]?.emoji, "🔵");
});

test("parseRoles ignores malformed entries", () => {
	assert.deepEqual(parseRoles(panel("nope")), []);
	assert.deepEqual(parseRoles(panel([{ bad: true }, 5, null])), []);
});
