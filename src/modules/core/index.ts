import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { SlashCommandBuilder } from "discord.js";

const ping: SlashCommand = {
	data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency"),
	execute: async ({ interaction, client }) => {
		const latency = Math.max(0, Math.round(client.ws.ping));
		await reply.components(interaction, [
			container(Accent.info, [text(t("core:ping", { ms: latency }))]),
		]);
	},
};

const help: SlashCommand = {
	data: new SlashCommandBuilder().setName("help").setDescription("List available commands"),
	execute: async ({ interaction, client }) => {
		const names = [...client.commands.keys()].sort().map((n) => `\`/${n}\``);
		await reply.components(interaction, [
			container(Accent.info, [
				text(t("core:help.title")),
				text(names.length ? names.join(" ") : t("core:help.none")),
			]),
		]);
	},
};

const core: BotModule = {
	name: "core",
	commands: [ping, help],
	i18n: {
		ping: "🏓 Pong! `{ms}ms` gateway latency.",
		"help.title": "# Commands",
		"help.none": "No commands are loaded yet.",
	},
};

export default core;
