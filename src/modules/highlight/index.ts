import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { highlightEvents } from "./events.ts";
import {
	addHighlight,
	clearHighlights,
	listHighlights,
	MAX_WORDS,
	removeHighlight,
} from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("highlight")
		.setDescription("Get a DM when someone mentions a word you care about");
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Start watching a word")
			.addStringOption((o) => o.setName("word").setDescription("Word to watch").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Stop watching a word")
			.addStringOption((o) => o.setName("word").setDescription("Word to drop").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("Show the words you watch"));
	cmd.addSubcommand((s) => s.setName("clear").setDescription("Stop watching all words"));
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
	const userId = interaction.user.id;

	switch (sub) {
		case "add": {
			const word = interaction.options.getString("word", true);
			const result = await addHighlight(guild.id, userId, word);
			if (result === "tooShort") return void reply.error(interaction, t("highlight:add.tooShort"));
			if (result === "exists") return void reply.error(interaction, t("highlight:add.exists"));
			if (result === "limit")
				return void reply.error(interaction, t("highlight:add.limit", { max: MAX_WORDS }));
			return void reply.success(
				interaction,
				t("highlight:add.ok", { word: word.trim().toLowerCase() }),
				true,
			);
		}
		case "remove": {
			const word = interaction.options.getString("word", true);
			const removed = await removeHighlight(guild.id, userId, word);
			if (!removed) return void reply.error(interaction, t("highlight:remove.notFound"));
			return void reply.success(
				interaction,
				t("highlight:remove.ok", { word: word.trim().toLowerCase() }),
				true,
			);
		}
		case "clear": {
			const count = await clearHighlights(guild.id, userId);
			return void reply.success(interaction, t("highlight:clear.ok", { count }), true);
		}
		default: {
			const words = await listHighlights(guild.id, userId);
			if (words.length === 0) {
				return void reply.components(
					interaction,
					[container(Accent.info, [text(t("highlight:list.empty"))])],
					true,
				);
			}
			return void reply.components(
				interaction,
				[
					container(Accent.info, [
						text(t("highlight:list.title")),
						text(words.map((w) => `\`${w}\``).join(", ")),
					]),
				],
				true,
			);
		}
	}
}

const highlightCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const highlight: BotModule = {
	name: "highlight",
	commands: [highlightCommand],
	events: highlightEvents,
	i18n: {
		"add.ok": "🔔 Now watching **{word}**. I will DM you when it comes up.",
		"add.exists": "You are already watching that word.",
		"add.limit": "You can watch at most {max} words. Remove one first.",
		"add.tooShort": "That word is too short to watch.",
		"remove.ok": "🔕 Stopped watching **{word}**.",
		"remove.notFound": "You were not watching that word.",
		"clear.ok": "🧹 Cleared {count} highlighted word(s).",
		"list.title": "# 🔔 Your highlights",
		"list.empty": "You are not watching any words yet. Add one with `/highlight add`.",
	},
};

export default highlight;
