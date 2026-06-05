import { config } from "@/config.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { SlashCommandBuilder } from "discord.js";
import { ask } from "./service.ts";

const askCommand: SlashCommand = {
	data: new SlashCommandBuilder()
		.setName("ask")
		.setDescription("Ask Rostra a question")
		.addStringOption((o) =>
			o.setName("question").setDescription("Your question").setRequired(true),
		) as SlashCommandBuilder,
	cooldownMs: 5000,
	execute: async ({ interaction }) => {
		if (!config.ai.apiKey || !config.ai.baseUrl) {
			return void reply.error(interaction, t("ai:unconfigured"));
		}
		const question = interaction.options.getString("question", true);
		await interaction.deferReply();
		try {
			const answer = await ask(question);
			await reply.components(interaction, [container(Accent.info, [text(answer)])]);
		} catch {
			await reply.error(interaction, t("ai:error"));
		}
	},
};

const ai: BotModule = {
	name: "ai",
	commands: [askCommand],
	i18n: {
		unconfigured: "The assistant isn't available right now.",
		error: "Sorry, I couldn't answer that just now. Please try again later.",
	},
};

export default ai;
