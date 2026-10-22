import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "@rostra/config";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { memberCan } from "./permissions.ts";

test("configured owner cannot bypass a missing guild permission", () => {
	config.discord.ownerIds.push("configured-owner");
	try {
		const member = {
			id: "configured-owner",
			permissions: { has: () => false },
		} as unknown as GuildMember;
		assert.equal(memberCan(member, PermissionFlagsBits.ManageGuild), false);
		assert.equal(
			memberCan(
				{ ...member, permissions: { has: () => true } } as unknown as GuildMember,
				PermissionFlagsBits.ManageGuild,
			),
			true,
		);
	} finally {
		config.discord.ownerIds.pop();
	}
});
