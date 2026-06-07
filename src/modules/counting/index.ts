import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { setFeatures } from "@/services/tenant.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { countingEvents } from "./events.ts";
import { disableChannel, getConfig, setupChannel } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("counting")
		.setDescription("A channel where members count up together")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Turn a channel into the counting channel")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("disable")
			.setDescription("Stop counting in a channel")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("status")
			.setDescription("Show the current count")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();
	const channel = interaction.options.getChannel("channel", true);

	switch (sub) {
		case "setup": {
			await setupChannel(guild.id, channel.id);
			await setFeatures(guild.id, { counting: true });
			return void reply.success(
				interaction,
				t("counting:setupDone", { channel: `<#${channel.id}>` }),
				true,
			);
		}
		case "disable": {
			const removed = await disableChannel(channel.id);
			return removed
				? void reply.success(interaction, t("counting:disabled"), true)
				: void reply.error(interaction, t("counting:notCounting"));
		}
		case "status": {
			const config = await getConfig(channel.id);
			if (!config) return void reply.error(interaction, t("counting:notCounting"));
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("counting:status.title")),
					text(
						t("counting:status.body", {
							channel: `<#${channel.id}>`,
							next: config.current + 1,
							best: config.best,
						}),
					),
				]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const counting: BotModule = {
	name: "counting",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	events: countingEvents,
	i18n: {
		setupDone: "🔢 {channel} is now the counting channel. Start at **1**!",
		disabled: "🔢 Counting turned off for that channel.",
		notCounting: "That channel is not a counting channel.",
		"status.title": "# 🔢 Counting",
		"status.body": "Channel: {channel}\nNext number: **{next}**\nBest streak: **{best}**",
	},
};

export default counting;
