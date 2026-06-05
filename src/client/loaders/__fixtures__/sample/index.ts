import type { BotModule } from "@/types/module.ts";
import { SlashCommandBuilder } from "discord.js";

const sample: BotModule = {
	name: "sample",
	commands: [
		{
			data: new SlashCommandBuilder().setName("sample").setDescription("fixture command"),
			execute: async () => {},
		},
	],
};

export default sample;
