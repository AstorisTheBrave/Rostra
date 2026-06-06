import type { AntinukeConfig } from "@prisma/client";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { securityEvents } from "./events.ts";
import { type AntinukeModule, getConfig, upsertConfig } from "./service.ts";

const MODULE_KEYS: AntinukeModule[] = [
	"antiBan",
	"antiKick",
	"antiBotAdd",
	"antiChannel",
	"antiRole",
	"antiWebhook",
	"antiGuildUpdate",
];

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("security")
		.setDescription("Antinuke and server protection")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

	cmd.addSubcommand((s) => s.setName("enable").setDescription("Enable antinuke"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable antinuke"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show antinuke settings"));
	cmd.addSubcommand((s) =>
		s
			.setName("punishment")
			.setDescription("Set the punishment for violators")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("How to punish")
					.setRequired(true)
					.addChoices(
						{ name: "Ban", value: "ban" },
						{ name: "Kick", value: "kick" },
						{ name: "Strip roles", value: "strip" },
					),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("logchannel")
			.setDescription("Set the antinuke log channel")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Log channel").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("notify")
			.setDescription("Toggle DM alerts to the server owner")
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("module")
			.setDescription("Toggle a protection module")
			.addStringOption((o) =>
				o
					.setName("name")
					.setDescription("Module")
					.setRequired(true)
					.addChoices(...MODULE_KEYS.map((k) => ({ name: k, value: k }))),
			)
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("whitelist")
			.setDescription("Trusted users immune to antinuke")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Whitelist a user")
					.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a user from the whitelist")
					.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
			),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("extraowner")
			.setDescription("Extra owners with full trust")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add an extra owner")
					.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove an extra owner")
					.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<AntinukeConfig> {
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
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
	if (!isAdmin && interaction.user.id !== guild.ownerId) {
		return void reply.error(interaction, t("common:error.missingPermissions"));
	}

	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === "whitelist" || group === "extraowner") {
		const user = interaction.options.getUser("user", true);
		const cfg = await ensureConfig(guild.id);
		const field = group === "whitelist" ? "whitelist" : "extraOwners";
		const current = cfg[field];
		const next =
			sub === "add" ? uniq([...current, user.id]) : current.filter((id) => id !== user.id);
		await upsertConfig(guild.id, { [field]: next });
		return ok(interaction, `security:${group}.${sub}`, { user: user.tag });
	}

	switch (sub) {
		case "enable":
			await upsertConfig(guild.id, { enabled: true });
			return ok(interaction, "security:enabled");
		case "disable":
			await upsertConfig(guild.id, { enabled: false });
			return ok(interaction, "security:disabled");
		case "punishment": {
			const type = interaction.options.getString("type", true);
			await upsertConfig(guild.id, { punishment: type });
			return ok(interaction, "security:punishment.set", { type });
		}
		case "logchannel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { logChannelId: channel.id });
			return ok(interaction, "security:logchannel.set", { channel: `<#${channel.id}>` });
		}
		case "notify": {
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { notifyOwner: enabled });
			return ok(interaction, enabled ? "security:notify.on" : "security:notify.off");
		}
		case "module": {
			const name = interaction.options.getString("name", true) as AntinukeModule;
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { [name]: enabled });
			return ok(interaction, "security:module.set", { name, state: enabled ? "on" : "off" });
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "security:status.unconfigured");
			const modules = MODULE_KEYS.map((k) => `${cfg[k] ? "✅" : "❌"} ${k}`).join("\n");
			const lines = [
				t("security:status.title"),
				t("security:status.line", {
					enabled: cfg.enabled ? "on" : "off",
					punishment: cfg.punishment,
					log: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "none",
					notify: cfg.notifyOwner ? "on" : "off",
					whitelist: cfg.whitelist.length,
					owners: cfg.extraOwners.length,
				}),
				modules,
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const securityCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const security: BotModule = {
	name: "security",
	commands: [securityCommand],
	events: securityEvents,
	i18n: {
		enabled: "🛡️ Antinuke **enabled**.",
		disabled: "🛡️ Antinuke **disabled**.",
		"punishment.set": "⚙️ Punishment set to **{type}**.",
		"logchannel.set": "📋 Antinuke log channel set to {channel}.",
		"notify.on": "🔔 Owner DM alerts **enabled**.",
		"notify.off": "🔕 Owner DM alerts **disabled**.",
		"module.set": "⚙️ Module **{name}** turned **{state}**.",
		"whitelist.add": "✅ Whitelisted **{user}**.",
		"whitelist.remove": "➖ Removed **{user}** from the whitelist.",
		"extraowner.add": "👑 Added **{user}** as an extra owner.",
		"extraowner.remove": "➖ Removed **{user}** from extra owners.",
		"status.title": "# 🛡️ Antinuke status",
		"status.line":
			"**Enabled:** {enabled} • **Punishment:** {punishment}\n**Log:** {log} • **Owner DMs:** {notify}\n**Whitelisted:** {whitelist} • **Extra owners:** {owners}",
		"status.unconfigured": "Antinuke has not been set up. Use `/security enable` to start.",
	},
};

export default security;
