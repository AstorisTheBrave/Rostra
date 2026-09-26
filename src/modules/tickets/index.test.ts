import assert from "node:assert/strict";
import { test } from "node:test";
import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import { buildData } from "./index.ts";

test("ticket setup only offers categories and sendable log channels in Discord", () => {
	const command = buildData().toJSON();
	const option = (subcommand: string, name: string) => {
		const sub = command.options?.find((entry) => entry.name === subcommand);
		if (sub?.type !== ApplicationCommandOptionType.Subcommand) return undefined;
		const field = sub.options?.find((entry) => entry.name === name);
		return field?.type === ApplicationCommandOptionType.Channel ? field : undefined;
	};

	assert.deepEqual(option("category", "category")?.channel_types, [ChannelType.GuildCategory]);
	assert.deepEqual(option("logchannel", "channel")?.channel_types, [
		ChannelType.GuildText,
		ChannelType.GuildAnnouncement,
	]);
});
