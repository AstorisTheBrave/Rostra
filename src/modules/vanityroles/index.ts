import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { vanityEvents } from "./events.ts";
import { getConfig, upsertConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("vanityrole")
		.setDescription("Grant a role to members whose status contains a keyword")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set the keyword and reward role (enables it)")
			.addStringOption((o) =>
				o.setName("keyword").setDescription("Text to look for in statuses").setRequired(true),
			)
			.addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable vanity roles"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show settings"));
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

	switch (sub) {
		case "set": {
			const keyword = interaction.options.getString("keyword", true);
			const role = interaction.options.getRole("role", true);
			await upsertConfig(guild.id, { enabled: true, keyword, roleId: role.id });
			return void reply.components(interaction, [
				container(Accent.success, [text(t("vanity:set", { keyword, role: role.name }))]),
			]);
		}
		case "disable": {
			await upsertConfig(guild.id, { enabled: false });
			return void reply.components(interaction, [
				container(Accent.success, [text(t("vanity:disabled"))]),
			]);
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg?.enabled || !cfg.keyword || !cfg.roleId) {
				return void reply.components(interaction, [
					container(Accent.info, [text(t("vanity:unconfigured"))]),
				]);
			}
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("vanity:statusTitle")),
					text(t("vanity:statusLine", { keyword: cfg.keyword, role: `<@&${cfg.roleId}>` })),
				]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const vanityCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const vanityroles: BotModule = {
	name: "vanityroles",
	commands: [vanityCommand],
	events: vanityEvents,
	i18n: {
		set: "✨ Members with **{keyword}** in their status will get **{role}**.",
		disabled: "✨ Vanity roles disabled.",
		unconfigured: "Not set up. Use `/vanityrole set` with a keyword and role.",
		statusTitle: "# ✨ Vanity role",
		statusLine: "**Keyword:** `{keyword}` • **Role:** {role}",
	},
};

export default vanityroles;
