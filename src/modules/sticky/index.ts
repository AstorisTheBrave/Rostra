import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { stickyEvents } from "./events.ts";
import { getGuildStickies, removeSticky, setSticky } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("sticky")
		.setDescription("Keep a message pinned to the bottom of a channel")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set or replace this channel's sticky message")
			.addStringOption((o) =>
				o.setName("text").setDescription("Message to keep at the bottom").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s.setName("remove").setDescription("Remove this channel's sticky message"),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List sticky messages in this server"));
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
		case "set": {
			const content = interaction.options.getString("text", true);
			await setSticky(guild.id, interaction.channelId, content);
			return void reply.success(interaction, t("sticky:set.ok"), true);
		}
		case "remove": {
			const removed = await removeSticky(guild.id, interaction.channelId);
			if (!removed) return void reply.error(interaction, t("sticky:remove.none"));
			return void reply.success(interaction, t("sticky:remove.ok"), true);
		}
		default: {
			const stickies = await getGuildStickies(guild.id);
			if (stickies.size === 0) {
				return void reply.components(
					interaction,
					[container(Accent.info, [text(t("sticky:list.empty"))])],
					true,
				);
			}
			const lines = [...stickies.values()].map(
				(r) => `<#${r.channelId}> - ${r.content.slice(0, 60)}${r.content.length > 60 ? "..." : ""}`,
			);
			return void reply.components(
				interaction,
				[container(Accent.info, [text(t("sticky:list.title")), text(lines.join("\n"))])],
				true,
			);
		}
	}
}

const stickyCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const sticky: BotModule = {
	name: "sticky",
	commands: [stickyCommand],
	events: stickyEvents,
	i18n: {
		"set.ok": "📌 Sticky message set. It will stay at the bottom of this channel.",
		"remove.ok": "🗑️ Sticky message removed from this channel.",
		"remove.none": "This channel has no sticky message.",
		"list.title": "# 📌 Sticky messages",
		"list.empty": "No sticky messages set in this server.",
	},
};

export default sticky;
