import { SlashCommandBuilder } from "discord.js";
import { config } from "@/config.ts";
import { t } from "@/i18n/index.ts";
import { isFeatureLive, registerFeature } from "@/services/featureFlags.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { ask } from "./service.ts";

// On by default, but globally killable in seconds (e.g. if the upstream provider
// degrades) via `/owner feature set ai off` - no restart, fleet-wide.
registerFeature("ai", true);

const askCommand: SlashCommand = {
	data: new SlashCommandBuilder()
		.setName("ask")
		.setDescription("Ask Rostra a question")
		.addStringOption((o) =>
			o.setName("question").setDescription("Your question").setRequired(true),
		) as SlashCommandBuilder,
	cooldownMs: 5000,
	heartbeat: true,
	execute: async ({ interaction }) => {
		if (!isFeatureLive("ai") || !config.ai.apiKey || !config.ai.baseUrl) {
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
