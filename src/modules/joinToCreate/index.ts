import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { j2cEvents } from "./events.ts";
import { getConfig, upsertConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("voicehub")
		.setDescription("Join-to-create temporary voice channels")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set the hub channel users join to spawn a temp channel")
			.addChannelOption((o) =>
				o.setName("hub").setDescription("Hub voice channel").setRequired(true),
			)
			.addChannelOption((o) => o.setName("category").setDescription("Category for temp channels")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("nametemplate")
			.setDescription("Name template ({user} = the owner)")
			.addStringOption((o) =>
				o.setName("text").setDescription("e.g. {user}'s room").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("limit")
			.setDescription("Default user limit for temp channels (0 = unlimited)")
			.addIntegerOption((o) =>
				o.setName("count").setDescription("0-99").setRequired(true).setMinValue(0).setMaxValue(99),
			),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable join-to-create"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show settings"));
	return cmd;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	key: string,
	vars: Record<string, string | number> = {},
	accent: number = Accent.success,
): Promise<void> {
	await reply.components(interaction, [container(accent, [text(t(key, vars))])]);
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
			const hub = interaction.options.getChannel("hub", true);
			const category = interaction.options.getChannel("category");
			await upsertConfig(guild.id, { hubChannelId: hub.id, categoryId: category?.id ?? null });
			return ok(interaction, "j2c:set", { hub: hub.name ?? "channel" });
		}
		case "nametemplate": {
			const template = interaction.options.getString("text", true);
			await upsertConfig(guild.id, { nameTemplate: template });
			return ok(interaction, "j2c:nametemplate.set", { template });
		}
		case "limit": {
			const count = interaction.options.getInteger("count", true);
			await upsertConfig(guild.id, { userLimit: count });
			return ok(interaction, "j2c:limit.set", { count });
		}
		case "disable": {
			await upsertConfig(guild.id, { hubChannelId: null });
			return ok(interaction, "j2c:disabled");
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg?.hubChannelId) return ok(interaction, "j2c:status.unconfigured", {}, Accent.info);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("j2c:status.title")),
					text(
						t("j2c:status.line", {
							hub: `<#${cfg.hubChannelId}>`,
							category: cfg.categoryId ? `<#${cfg.categoryId}>` : "none",
							template: cfg.nameTemplate,
							limit: cfg.userLimit || "unlimited",
						}),
					),
				]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const voicehubCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const joinToCreate: BotModule = {
	name: "joinToCreate",
	commands: [voicehubCommand],
	events: j2cEvents,
	i18n: {
		set: "🔊 Hub set to **{hub}**. Joining it creates a temp channel.",
		"nametemplate.set": "✏️ Temp channel names: `{template}`.",
		"limit.set": "👥 Default user limit set to **{count}**.",
		disabled: "🔇 Join-to-create disabled.",
		"status.title": "# 🔊 Join-to-create",
		"status.line":
			"**Hub:** {hub} • **Category:** {category}\n**Name:** `{template}` • **Limit:** {limit}",
		"status.unconfigured": "Not set up. Use `/voicehub set` with a hub voice channel.",
	},
};

export default joinToCreate;
