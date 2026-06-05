import assert from "node:assert/strict";
import { test } from "node:test";
import type { SlashCommand } from "@/types/module.ts";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	PermissionsBitField,
} from "discord.js";
import { checkPermissions } from "./permissions.ts";

const baseCommand: SlashCommand = {
	data: { name: "x", toJSON: () => ({ name: "x", description: "x", type: 1 }) },
	execute: async () => {},
};

function fakeInteraction(overrides: Record<string, unknown>): ChatInputCommandInteraction {
	return {
		user: { id: "user-1" },
		inGuild: () => true,
		memberPermissions: null,
		guild: null,
		...overrides,
	} as unknown as ChatInputCommandInteraction;
}

test("allows a command with no restrictions", () => {
	const res = checkPermissions(fakeInteraction({}), baseCommand);
	assert.equal(res.ok, true);
});

test("denies owner-only command for a non-owner", () => {
	const res = checkPermissions(fakeInteraction({}), { ...baseCommand, ownerOnly: true });
	assert.equal(res.ok, false);
	assert.equal(res.reason, "owner");
});

test("denies guild-only command used outside a guild", () => {
	const res = checkPermissions(fakeInteraction({ inGuild: () => false }), {
		...baseCommand,
		guildOnly: true,
	});
	assert.equal(res.reason, "guild");
});

test("denies when the member lacks a required permission", () => {
	const res = checkPermissions(fakeInteraction({ memberPermissions: new PermissionsBitField() }), {
		...baseCommand,
		userPermissions: [PermissionFlagsBits.BanMembers],
	});
	assert.equal(res.reason, "userPerms");
});

test("allows when the member has the required permission", () => {
	const res = checkPermissions(
		fakeInteraction({ memberPermissions: new PermissionsBitField(PermissionFlagsBits.BanMembers) }),
		{ ...baseCommand, userPermissions: [PermissionFlagsBits.BanMembers] },
	);
	assert.equal(res.ok, true);
});
