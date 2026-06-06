import type { WelcomeConfig } from "@prisma/client";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { getTenant, setFeatures } from "@/services/tenant.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { welcomeEvents } from "./events.ts";
import { formatMessage, getConfig, type MessageContext, upsertConfig } from "./service.ts";

const TARGETS = [
	{ name: "Welcome", value: "welcome" },
	{ name: "Goodbye", value: "goodbye" },
] as const;
const MSG_TARGETS = [...TARGETS, { name: "Welcome DM", value: "dm" }] as const;

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("welcome")
		.setDescription("Welcome, goodbye, and auto-role settings")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) =>
		s
			.setName("channel")
			.setDescription("Set the welcome or goodbye channel")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("Which")
					.setRequired(true)
					.addChoices(...TARGETS),
			)
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("message")
			.setDescription("Set a message template ({user} {username} {server} {membercount})")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("Which")
					.setRequired(true)
					.addChoices(...MSG_TARGETS),
			)
			.addStringOption((o) => o.setName("text").setDescription("Template").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("toggle")
			.setDescription("Turn a feature on or off")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("Which")
					.setRequired(true)
					.addChoices(...MSG_TARGETS),
			)
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s.setName("setup").setDescription("One-click welcome setup (uses this channel)"),
	);
	cmd.addSubcommand((s) => s.setName("test").setDescription("Preview the welcome message"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show settings"));
	cmd.addSubcommandGroup((g) =>
		g
			.setName("autorole")
			.setDescription("Roles auto-assigned on join")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add an autorole")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove an autorole")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<WelcomeConfig> {
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

	if (group === "autorole") {
		const role = interaction.options.getRole("role", true);
		const cfg = await ensureConfig(guild.id);
		const next =
			sub === "add"
				? uniq([...cfg.autoroleIds, role.id])
				: cfg.autoroleIds.filter((r) => r !== role.id);
		await upsertConfig(guild.id, { autoroleIds: next });
		return ok(interaction, `welcome:autorole.${sub}`, { role: role.name });
	}

	switch (sub) {
		case "setup": {
			const tenant = await getTenant(guild.id);
			const channelId = tenant.welcomeChannelId ?? interaction.channelId;
			await upsertConfig(guild.id, { welcomeEnabled: true, welcomeChannelId: channelId });
			await setFeatures(guild.id, { welcome: true });
			return ok(interaction, "welcome:setup.done", { channel: `<#${channelId}>` });
		}
		case "channel": {
			const type = interaction.options.getString("type", true);
			const channel = interaction.options.getChannel("channel", true);
			const field = type === "welcome" ? "welcomeChannelId" : "goodbyeChannelId";
			await upsertConfig(guild.id, { [field]: channel.id });
			return ok(interaction, "welcome:channel.set", { type, channel: `<#${channel.id}>` });
		}
		case "message": {
			const type = interaction.options.getString("type", true);
			const textValue = interaction.options.getString("text", true);
			const field =
				type === "welcome" ? "welcomeMessage" : type === "goodbye" ? "goodbyeMessage" : "dmMessage";
			await upsertConfig(guild.id, { [field]: textValue });
			return ok(interaction, "welcome:message.set", { type });
		}
		case "toggle": {
			const type = interaction.options.getString("type", true);
			const enabled = interaction.options.getBoolean("enabled", true);
			const field =
				type === "welcome" ? "welcomeEnabled" : type === "goodbye" ? "goodbyeEnabled" : "dmEnabled";
			await upsertConfig(guild.id, { [field]: enabled });
			return ok(interaction, "welcome:toggle.set", { type, state: enabled ? "on" : "off" });
		}
		case "test": {
			const cfg = await ensureConfig(guild.id);
			const ctx: MessageContext = {
				user: `<@${interaction.user.id}>`,
				username: interaction.user.username,
				server: guild.name,
				memberCount: guild.memberCount,
			};
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("welcome:test.title")),
					text(formatMessage(cfg.welcomeMessage, ctx)),
				]),
			]);
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "welcome:status.unconfigured");
			const lines = [
				t("welcome:status.title"),
				t("welcome:status.line", {
					welcome: cfg.welcomeEnabled ? "on" : "off",
					welcomeChannel: cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : "none",
					goodbye: cfg.goodbyeEnabled ? "on" : "off",
					goodbyeChannel: cfg.goodbyeChannelId ? `<#${cfg.goodbyeChannelId}>` : "none",
					dm: cfg.dmEnabled ? "on" : "off",
					autoroles: cfg.autoroleIds.length,
				}),
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const welcomeCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const welcome: BotModule = {
	name: "welcome",
	commands: [welcomeCommand],
	events: welcomeEvents,
	i18n: {
		"setup.done": "👋 Welcome messages are on, greeting new members in {channel}.",
		"channel.set": "📍 {type} channel set to {channel}.",
		"message.set": "✏️ {type} message updated.",
		"toggle.set": "⚙️ **{type}** turned **{state}**.",
		"autorole.add": "✅ **{role}** will be assigned on join.",
		"autorole.remove": "➖ **{role}** removed from autoroles.",
		"test.title": "# 👋 Welcome preview",
		"status.title": "# 👋 Welcome settings",
		"status.line":
			"**Welcome:** {welcome} → {welcomeChannel}\n**Goodbye:** {goodbye} → {goodbyeChannel}\n**Welcome DM:** {dm} • **Autoroles:** {autoroles}",
		"status.unconfigured": "Not set up yet. Use `/welcome channel` and `/welcome toggle` to start.",
	},
};

export default welcome;
