import assert from "node:assert/strict";
import { test } from "node:test";
import { config as runtimeConfig } from "@rostra/config";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { isSupport } from "./service.ts";

test("configured owner without Manage Guild or support role is not ticket staff", () => {
	runtimeConfig.discord.ownerIds.push("configured-owner");
	try {
		const member = {
			id: "configured-owner",
			permissions: { has: () => false },
			roles: { cache: { has: () => false } },
		} as unknown as GuildMember;
		const config = { supportRoleIds: ["support"] } as Parameters<typeof isSupport>[1];
		assert.equal(isSupport(member, config), false);
		const staff = {
			...member,
			permissions: { has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild },
		} as unknown as GuildMember;
		assert.equal(isSupport(staff, config), true);
		const support = {
			...member,
			roles: { cache: { has: (roleId: string) => roleId === "support" } },
		} as unknown as GuildMember;
		assert.equal(isSupport(support, config), true);
	} finally {
		runtimeConfig.discord.ownerIds.pop();
	}
});
