import type { AutomodConfig } from "@prisma/client";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { defineEvent } from "@/client/defineEvent.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { checkMessage, enforce, getConfig, upsertConfig } from "./service.ts";

type ModuleField = Extract<keyof AutomodConfig, `anti${string}`>;

const MODULE_CHOICES: { name: string; value: string; field: ModuleField }[] = [
	{ name: "Anti-invite", value: "invite", field: "antiInvite" },
	{ name: "Anti-link", value: "link", field: "antiLink" },
	{ name: "Anti-spam", value: "spam", field: "antiSpam" },
	{ name: "Anti-mass-mention", value: "massmention", field: "antiMassMention" },
	{ name: "Anti-profanity", value: "profanity", field: "antiProfanity" },
	{ name: "Anti-caps", value: "caps", field: "antiCaps" },
];

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("automod")
		.setDescription("Automatic moderation filters")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) => s.setName("enable").setDescription("Enable automod"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable automod"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show automod settings"));
	cmd.addSubcommand((s) =>
		s
			.setName("action")
			.setDescription("What to do on a violation")
			.addStringOption((o) =>
				o
					.setName("type")
					.setDescription("Action")
					.setRequired(true)
					.addChoices(
						{ name: "Delete only", value: "delete" },
						{ name: "Delete + warn", value: "warn" },
						{ name: "Delete + timeout", value: "timeout" },
					),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("module")
			.setDescription("Toggle a filter")
			.addStringOption((o) =>
				o
					.setName("name")
					.setDescription("Filter")
					.setRequired(true)
					.addChoices(...MODULE_CHOICES.map((c) => ({ name: c.name, value: c.value }))),
			)
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("limits")
			.setDescription("Tune thresholds")
			.addIntegerOption((o) =>
				o
					.setName("spam_count")
					.setDescription("Messages per window")
					.setMinValue(2)
					.setMaxValue(20),
			)
			.addIntegerOption((o) =>
				o.setName("mention_limit").setDescription("Max mentions").setMinValue(2).setMaxValue(20),
			)
			.addIntegerOption((o) =>
				o.setName("caps_percent").setDescription("Caps %").setMinValue(40).setMaxValue(100),
			)
			.addIntegerOption((o) =>
				o
					.setName("timeout_minutes")
					.setDescription("Timeout length")
					.setMinValue(1)
					.setMaxValue(1440),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("logchannel")
			.setDescription("Set the automod log channel")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Log channel").setRequired(true),
			),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("exempt")
			.setDescription("Roles/channels exempt from automod")
			.addSubcommand((s) =>
				s
					.setName("addrole")
					.setDescription("Exempt a role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("removerole")
					.setDescription("Unexempt a role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("addchannel")
					.setDescription("Exempt a channel")
					.addChannelOption((o) =>
						o.setName("channel").setDescription("Channel").setRequired(true),
					),
			)
			.addSubcommand((s) =>
				s
					.setName("removechannel")
					.setDescription("Unexempt a channel")
					.addChannelOption((o) =>
						o.setName("channel").setDescription("Channel").setRequired(true),
					),
			),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("word")
			.setDescription("Custom profanity words")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add a filtered word")
					.addStringOption((o) => o.setName("word").setDescription("Word").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a filtered word")
					.addStringOption((o) => o.setName("word").setDescription("Word").setRequired(true)),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<AutomodConfig> {
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

	if (group === "exempt") {
		const cfg = await ensureConfig(guild.id);
		if (sub === "addrole" || sub === "removerole") {
			const role = interaction.options.getRole("role", true);
			const next =
				sub === "addrole"
					? uniq([...cfg.exemptRoles, role.id])
					: cfg.exemptRoles.filter((r) => r !== role.id);
			await upsertConfig(guild.id, { exemptRoles: next });
			return ok(interaction, `automod:exempt.${sub === "addrole" ? "addrole" : "removerole"}`, {
				name: role.name,
			});
		}
		const channel = interaction.options.getChannel("channel", true);
		const next =
			sub === "addchannel"
				? uniq([...cfg.exemptChannels, channel.id])
				: cfg.exemptChannels.filter((c) => c !== channel.id);
		await upsertConfig(guild.id, { exemptChannels: next });
		return ok(
			interaction,
			`automod:exempt.${sub === "addchannel" ? "addchannel" : "removechannel"}`,
			{ name: `<#${channel.id}>` },
		);
	}

	if (group === "word") {
		const word = interaction.options.getString("word", true).toLowerCase();
		const cfg = await ensureConfig(guild.id);
		const next =
			sub === "add" ? uniq([...cfg.customWords, word]) : cfg.customWords.filter((w) => w !== word);
		await upsertConfig(guild.id, { customWords: next });
		return ok(interaction, `automod:word.${sub}`, { word });
	}

	switch (sub) {
		case "enable":
			await upsertConfig(guild.id, { enabled: true });
			return ok(interaction, "automod:enabled");
		case "disable":
			await upsertConfig(guild.id, { enabled: false });
			return ok(interaction, "automod:disabled");
		case "action": {
			const type = interaction.options.getString("type", true);
			await upsertConfig(guild.id, { action: type });
			return ok(interaction, "automod:action.set", { type });
		}
		case "module": {
			const value = interaction.options.getString("name", true);
			const enabled = interaction.options.getBoolean("enabled", true);
			const choice = MODULE_CHOICES.find((c) => c.value === value);
			if (!choice) return void reply.error(interaction, t("common:error.generic"));
			await upsertConfig(guild.id, { [choice.field]: enabled });
			return ok(interaction, "automod:module.set", {
				name: choice.name,
				state: enabled ? "on" : "off",
			});
		}
		case "limits": {
			const data: Partial<AutomodConfig> = {};
			const spam = interaction.options.getInteger("spam_count");
			const mention = interaction.options.getInteger("mention_limit");
			const caps = interaction.options.getInteger("caps_percent");
			const timeout = interaction.options.getInteger("timeout_minutes");
			if (spam !== null) data.spamCount = spam;
			if (mention !== null) data.mentionLimit = mention;
			if (caps !== null) data.capsPercent = caps;
			if (timeout !== null) data.timeoutMs = timeout * 60_000;
			await upsertConfig(guild.id, data);
			return ok(interaction, "automod:limits.set");
		}
		case "logchannel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { logChannelId: channel.id });
			return ok(interaction, "automod:logchannel.set", { channel: `<#${channel.id}>` });
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "automod:status.unconfigured");
			const filters = MODULE_CHOICES.map((c) => `${cfg[c.field] ? "✅" : "❌"} ${c.name}`).join(
				"\n",
			);
			const lines = [
				t("automod:status.title"),
				t("automod:status.line", {
					enabled: cfg.enabled ? "on" : "off",
					action: cfg.action,
					log: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "none",
					spam: cfg.spamCount,
					mentions: cfg.mentionLimit,
					caps: cfg.capsPercent,
				}),
				filters,
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const automodCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const messageGuard = defineEvent("messageCreate", {
	execute: async (_client, message) => {
		if (message.author.bot || !message.inGuild()) return;
		const config = await getConfig(message.guild.id);
		if (!config?.enabled) return;
		const violation = checkMessage(message, config);
		if (violation) await enforce(message, config, violation);
	},
});

const automod: BotModule = {
	name: "automod",
	commands: [automodCommand],
	events: [messageGuard],
	i18n: {
		enabled: "🧹 Automod **enabled**.",
		disabled: "🧹 Automod **disabled**.",
		"action.set": "⚙️ Automod action set to **{type}**.",
		"module.set": "⚙️ Filter **{name}** turned **{state}**.",
		"limits.set": "⚙️ Thresholds updated.",
		"logchannel.set": "📋 Automod log channel set to {channel}.",
		"exempt.addrole": "✅ Role **{name}** is now exempt.",
		"exempt.removerole": "➖ Role **{name}** is no longer exempt.",
		"exempt.addchannel": "✅ Channel {name} is now exempt.",
		"exempt.removechannel": "➖ Channel {name} is no longer exempt.",
		"word.add": "✅ Added **{word}** to the filter.",
		"word.remove": "➖ Removed **{word}** from the filter.",
		"status.title": "# 🧹 Automod status",
		"status.line":
			"**Enabled:** {enabled} • **Action:** {action} • **Log:** {log}\n**Spam:** {spam}/window • **Mentions:** {mentions} • **Caps:** {caps}%",
		"status.unconfigured": "Automod has not been set up. Use `/automod enable` to start.",
	},
};

export default automod;
