import { SlashCommandBuilder } from "discord.js";
import type { BotModule } from "@/types/module.ts";

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
