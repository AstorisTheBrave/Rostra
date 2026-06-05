import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import type { LoggingConfig } from "@prisma/client";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { loggingEvents } from "./events.ts";
import { type LogEvent, getConfig, upsertConfig } from "./service.ts";

const EVENTS: { name: string; value: LogEvent }[] = [
	{ name: "Message deletes", value: "messageDelete" },
	{ name: "Message edits", value: "messageEdit" },
	{ name: "Member joins", value: "memberJoin" },
	{ name: "Member leaves", value: "memberLeave" },
	{ name: "Member bans", value: "memberBan" },
	{ name: "Member unbans", value: "memberUnban" },
	{ name: "Role changes", value: "roleChanges" },
	{ name: "Channel changes", value: "channelChanges" },
];

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("logging")
		.setDescription("Server audit logging")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) =>
		s
			.setName("channel")
			.setDescription("Set the log channel")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Log channel").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("toggle")
			.setDescription("Turn a log type on or off")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("Event type")
					.setRequired(true)
					.addChoices(...EVENTS.map((e) => ({ name: e.name, value: e.value }))),
			)
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show logging settings"));
	cmd.addSubcommandGroup((g) =>
		g
			.setName("ignore")
			.setDescription("Channels excluded from logging")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Ignore a channel")
					.addChannelOption((o) =>
						o.setName("channel").setDescription("Channel").setRequired(true),
					),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Stop ignoring a channel")
					.addChannelOption((o) =>
						o.setName("channel").setDescription("Channel").setRequired(true),
					),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<LoggingConfig> {
	return (await getConfig(guildId)) ?? (await upsertConfig(guildId, {}));
}

async function ok(
	interaction: ChatInputCommandInteraction,
	key: string,
	vars: Record<string, string | number> = {},
): Promise<void> {
	await reply.components(interaction, [container(Accent.success, [text(t(key, vars))])]);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));

	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === "ignore") {
		const channel = interaction.options.getChannel("channel", true);
		const cfg = await ensureConfig(guild.id);
		const next =
			sub === "add"
				? uniq([...cfg.ignoredChannels, channel.id])
				: cfg.ignoredChannels.filter((c) => c !== channel.id);
		await upsertConfig(guild.id, { ignoredChannels: next });
		return ok(interaction, `logging:ignore.${sub}`, { channel: `<#${channel.id}>` });
	}

	switch (sub) {
		case "channel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { logChannelId: channel.id });
			return ok(interaction, "logging:channel.set", { channel: `<#${channel.id}>` });
		}
		case "toggle": {
			const type = interaction.options.getString("type", true) as LogEvent;
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { [type]: enabled });
			return ok(interaction, "logging:toggle.set", { type, state: enabled ? "on" : "off" });
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "logging:status.unconfigured");
			const list = EVENTS.map((e) => `${cfg[e.value] ? "✅" : "❌"} ${e.name}`).join("\n");
			const lines = [
				t("logging:status.title"),
				t("logging:status.line", {
					channel: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "none",
					ignored: cfg.ignoredChannels.length,
				}),
				list,
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const loggingCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const logging: BotModule = {
	name: "logging",
	commands: [loggingCommand],
	events: loggingEvents,
	i18n: {
		"channel.set": "📋 Log channel set to {channel}.",
		"toggle.set": "⚙️ **{type}** logging turned **{state}**.",
		"ignore.add": "🙈 Now ignoring {channel}.",
		"ignore.remove": "👀 No longer ignoring {channel}.",
		"status.title": "# 📋 Logging status",
		"status.line": "**Channel:** {channel} • **Ignored channels:** {ignored}",
		"status.unconfigured": "Logging has not been set up. Use `/logging channel` to start.",
	},
};

export default logging;
