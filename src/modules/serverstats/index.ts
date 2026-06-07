import {
	ChannelType,
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import {
	addStat,
	applyTemplate,
	defaultTemplate,
	isStatType,
	listStats,
	removeStat,
	STAT_TYPES,
} from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("serverstats")
		.setDescription("Live server-count voice channels")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Create a stats voice channel")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("What to count")
					.setRequired(true)
					.addChoices(...STAT_TYPES.map((v) => ({ name: v, value: v }))),
			)
			.addStringOption((o) =>
				o.setName("template").setDescription("Name template, use {count} (optional)"),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Stop updating a stats channel")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("The stats channel").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List stats channels"));
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "add": {
			const type = interaction.options.getString("type", true);
			if (!isStatType(type)) return void reply.error(interaction, t("serverstats:badType"));
			const template = interaction.options.getString("template") ?? defaultTemplate(type);
			const channel = await guild.channels
				.create({
					name: applyTemplate(template, 0),
					type: ChannelType.GuildVoice,
					permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
				})
				.catch(() => null);
			if (!channel) return void reply.error(interaction, t("serverstats:createFailed"));
			await addStat(guild.id, channel.id, type, template);
			return void reply.success(
				interaction,
				t("serverstats:added", { channel: `<#${channel.id}>` }),
				true,
			);
		}
		case "remove": {
			const channel = interaction.options.getChannel("channel", true);
			const removed = await removeStat(guild.id, channel.id);
			if (!removed) return void reply.error(interaction, t("serverstats:notFound"));
			return void reply.success(interaction, t("serverstats:removed"), true);
		}
		default: {
			const rows = await listStats(guild.id);
			if (rows.length === 0) {
				return void reply.components(
					interaction,
					[container(Accent.info, [text(t("serverstats:list.empty"))])],
					true,
				);
			}
			const lines = rows.map((r) => `<#${r.channelId}> - **${r.type}** (\`${r.template}\`)`);
			return void reply.components(
				interaction,
				[container(Accent.info, [text(t("serverstats:list.title")), text(lines.join("\n"))])],
				true,
			);
		}
	}
}

const serverStatsCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const serverstats: BotModule = {
	name: "serverstats",
	commands: [serverStatsCommand],
	i18n: {
		added: "📊 Created {channel}. It updates every 10 minutes.",
		removed: "🗑️ Stats channel removed (the channel itself was kept).",
		notFound: "That is not a stats channel in this server.",
		badType: "Unknown stat type.",
		createFailed: "I could not create the channel. Check my Manage Channels permission.",
		"list.title": "# 📊 Stats channels",
		"list.empty": "No stats channels yet. Add one with `/serverstats add`.",
	},
};

export default serverstats;
