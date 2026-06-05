import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { extrasEvents } from "./events.ts";
import { addResponder, getResponders, getSnipe, removeResponder, setAfk } from "./service.ts";

const afkCommand: SlashCommand = {
	data: new SlashCommandBuilder()
		.setName("afk")
		.setDescription("Mark yourself as away")
		.addStringOption((o) => o.setName("reason").setDescription("Reason")) as SlashCommandBuilder,
	guildOnly: true,
	execute: async ({ interaction }) => {
		const guild = interaction.guild;
		if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
		const reason = interaction.options.getString("reason") ?? "AFK";
		await setAfk(guild.id, interaction.user.id, reason);
		await reply.components(interaction, [
			container(Accent.success, [text(t("extras:afk.set", { reason }))]),
		]);
	},
};

const snipeCommand: SlashCommand = {
	data: new SlashCommandBuilder()
		.setName("snipe")
		.setDescription("Show the last deleted message in this channel") as SlashCommandBuilder,
	guildOnly: true,
	execute: async ({ interaction }) => {
		const snipe = getSnipe(interaction.channelId);
		if (!snipe) return void reply.error(interaction, t("extras:snipe.none"));
		await reply.components(interaction, [
			container(Accent.info, [
				text(t("extras:snipe.title")),
				text(
					`**${snipe.authorTag}** • <t:${Math.floor(snipe.at / 1000)}:R>\n${snipe.content || "*no text content*"}`,
				),
			]),
		]);
	},
};

function autoresponderData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("autoresponder")
		.setDescription("Automatic replies to trigger phrases")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a trigger → response")
			.addStringOption((o) =>
				o.setName("trigger").setDescription("Phrase to match").setRequired(true),
			)
			.addStringOption((o) => o.setName("response").setDescription("Reply text").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Remove a trigger")
			.addStringOption((o) => o.setName("trigger").setDescription("Phrase").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List autoresponders"));
	return cmd;
}

const autoresponderCommand: SlashCommand = {
	data: autoresponderData(),
	guildOnly: true,
	execute: async ({ interaction }: { interaction: ChatInputCommandInteraction }) => {
		const guild = interaction.guild;
		if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
		const sub = interaction.options.getSubcommand();
		if (sub === "add") {
			const trigger = interaction.options.getString("trigger", true);
			const response = interaction.options.getString("response", true);
			await addResponder(guild.id, trigger, response);
			return void reply.components(interaction, [
				container(Accent.success, [text(t("extras:ar.add", { trigger }))]),
			]);
		}
		if (sub === "remove") {
			const trigger = interaction.options.getString("trigger", true);
			const removed = await removeResponder(guild.id, trigger);
			return removed
				? void reply.components(interaction, [
						container(Accent.success, [text(t("extras:ar.remove", { trigger }))]),
					])
				: void reply.error(interaction, t("extras:ar.notFound"));
		}
		const list = await getResponders(guild.id);
		if (list.length === 0) {
			return void reply.components(interaction, [
				container(Accent.info, [text(t("extras:ar.empty"))]),
			]);
		}
		const lines = list.map((r) => `\`${r.trigger}\` → ${r.response}`);
		await reply.components(interaction, [
			container(Accent.info, [text(t("extras:ar.title")), text(lines.join("\n"))]),
		]);
	},
};

const extras: BotModule = {
	name: "extras",
	commands: [afkCommand, snipeCommand, autoresponderCommand],
	events: extrasEvents,
	i18n: {
		"afk.set": "💤 You're now AFK: {reason}",
		"snipe.title": "# 🔍 Last deleted message",
		"snipe.none": "Nothing to snipe here.",
		"ar.add": "✅ Autoresponder added for `{trigger}`.",
		"ar.remove": "➖ Removed autoresponder `{trigger}`.",
		"ar.notFound": "No autoresponder with that trigger.",
		"ar.title": "# 💬 Autoresponders",
		"ar.empty": "No autoresponders set.",
	},
};

export default extras;
