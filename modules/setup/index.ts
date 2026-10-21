import type { GuildTenant } from "@rostra/database";
import {
	Accent,
	actionRow,
	button,
	container,
	divider,
	type EmojiName,
	emoji,
	reply,
	settingsPanel,
	text,
} from "@rostra/discord-ui";
import { t } from "@rostra/i18n";
import { SUPPORTED_LOCALES } from "@rostra/i18n/locales";
import {
	ButtonStyle,
	ChannelType,
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { setGuildLocale } from "@/services/localization.ts";
import { probeProvision } from "@/services/provisioning/probe.ts";
import {
	runProvision,
	type ProvisionResult,
} from "@/services/provisioning/runProvision.ts";
import {
	getTenant,
	isFeatureEnabled,
	setFeatures,
	updateTenantWithOutcome,
} from "@/services/tenant.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";

/** Core systems the wizard can toggle (key = tenant feature flag). */
const FEATURES: { key: string; label: string; emoji: EmojiName }[] = [
	{ key: "automod", label: "Auto-mod", emoji: "automod" },
	{ key: "verification", label: "Verification", emoji: "verification" },
	{ key: "logging", label: "Logging", emoji: "logging" },
	{ key: "welcome", label: "Welcome", emoji: "welcome" },
	{ key: "security", label: "Antinuke", emoji: "security" },
	{ key: "leveling", label: "Leveling", emoji: "leveling" },
	{ key: "economy", label: "Economy", emoji: "economy" },
	{ key: "starboard", label: "Starboard", emoji: "starboard" },
	{ key: "highlights", label: "Highlights", emoji: "highlight" },
	{ key: "sticky", label: "Sticky messages", emoji: "sticky" },
	{ key: "voicerole", label: "Voice role", emoji: "voicerole" },
	{ key: "modmail", label: "Modmail", emoji: "modmail" },
	{ key: "counting", label: "Counting", emoji: "counting" },
	{ key: "suggestions", label: "Suggestions", emoji: "suggest" },
];

/** Systems enabled by the one-click recommended baseline. */
const BASELINE = ["automod", "logging", "welcome", "security"];

export function featureWarning(
	outcome: Awaited<ReturnType<typeof setFeatures>>,
): string | undefined {
	const warnings = [
		...(outcome.failedProvisioners.length ? [t("setup:feature.provisionFailed")] : []),
		...(outcome.coherence.status === "ttl-fallback" ? [t("setup:feature.degraded")] : []),
	];
	return warnings.length ? warnings.join("\n") : undefined;
}

export function provisionWarnings(
	result: Pick<ProvisionResult, "failure" | "deliveryDelayed">,
): string[] {
	return [
		...(result.failure === "channel-map" ? [t("setup:provision.mapFailed")] : []),
		...(result.deliveryDelayed ? [t("setup:provision.degraded")] : []),
	];
}

function renderPanel(tenant: GuildTenant, warning?: string) {
	const items = FEATURES.map((f) => ({
		key: f.key,
		label: f.label,
		enabled: isFeatureEnabled(tenant, f.key),
	}));
	const logLine = tenant.logChannelId
		? t("setup:logSet", { channel: `<#${tenant.logChannelId}>` })
		: t("setup:logNone");
	return [
		container(Accent.info, [
			text(`# ${emoji("wizard")} ${t("setup:title")}`),
			text(t("setup:intro")),
			...(warning ? [text(warning)] : []),
			divider(),
			text(`${emoji("logging")} ${logLine}`),
			divider(),
			...settingsPanel("setup", items),
			actionRow(
				button({
					id: "setup:baseline",
					label: t("setup:applyBaseline"),
					style: ButtonStyle.Primary,
				}),
				button({
					id: "setup:logchannel",
					label: t("setup:createLog"),
					style: ButtonStyle.Secondary,
				}),
			),
		]),
	];
}

function isAdmin(interaction: { memberPermissions?: { has(p: bigint): boolean } | null }): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	if (!interaction.guildId) return void reply.error(interaction, t("common:error.guildOnly"));
	if (!isAdmin(interaction))
		return void reply.error(interaction, t("common:error.missingPermissions"));

	const sub = interaction.options.getSubcommand();
	if (sub === "language") {
		const code = interaction.options.getString("language", true);
		const outcome = await setGuildLocale(interaction.guildId, code);
		const label = SUPPORTED_LOCALES[code]?.native ?? code;
		if (outcome.coherence.status === "ttl-fallback") {
			return void reply.components(
				interaction,
				[
					container(Accent.warn, [
						text(t("setup:languageSaved", { language: label })),
						text(t("setup:feature.degraded")),
					]),
				],
				true,
			);
		}
		return void reply.success(interaction, t("setup:languageSet", { language: label }), true);
	}
	if (sub === "provision") {
		const guild = interaction.guild;
		if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
		const result = await runProvision(guild);
		if (result.missingPerms.length > 0) {
			return void reply.error(
				interaction,
				t("setup:provision.perms", { perms: result.missingPerms.join(", ") }),
			);
		}
		if (result.failure === "tenant-read")
			return void reply.error(interaction, t("setup:provision.tenantFailed"));
		const label = (i: { kind: string; id?: string; name: string }) =>
			!i.id ? i.name : i.kind === "channel" ? `<#${i.id}>` : `<@&${i.id}>`;
		const created = result.items.filter((i) => i.status === "created");
		const existed = result.items.filter((i) => i.status === "existed");
		const failed = result.items.filter((i) => i.status === "failed");
		const body = [
			t("setup:provision.created", {
				items: created.length ? created.map(label).join(", ") : t("setup:provision.none"),
			}),
			t("setup:provision.existed", {
				items: existed.length ? existed.map(label).join(", ") : t("setup:provision.none"),
			}),
			...(failed.length
				? [t("setup:provision.failed", { items: failed.map((i) => i.name).join(", ") })]
				: []),
			...provisionWarnings(result),
		].join("\n");
		return void reply.components(
			interaction,
			[
				container(result.ok ? Accent.success : Accent.warn, [
					text(`# ${emoji("wizard")} ${t("setup:provision.title")}`),
					text(body),
					text(t(result.ok ? "setup:provision.hint" : "setup:provision.retry")),
				]),
			],
			true,
		);
	}
	if (sub === "check") {
		const guild = interaction.guild;
		if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
		const items = await probeProvision(guild);
		const glyph = (s: string) => (s === "ok" ? "✅" : s === "missing" ? "⚠️" : "❔");
		const label = (i: { kind: string; id?: string; name: string }) =>
			i.id ? (i.kind === "channel" ? `<#${i.id}>` : `<@&${i.id}>`) : `\`${i.name}\``;
		const body = items.map((i) => `${glyph(i.status)} ${label(i)} - ${i.status}`).join("\n");
		const healthy = items.every((i) => i.status === "ok");
		return void reply.components(
			interaction,
			[
				container(healthy ? Accent.success : Accent.warn, [
					text(`# ${emoji("logging")} ${t("setup:check.title")}`),
					text(body),
					...(healthy ? [] : [text(t("setup:check.hint"))]),
				]),
			],
			true,
		);
	}
	const tenant = await getTenant(interaction.guildId);
	await reply.components(interaction, renderPanel(tenant), true);
}

const setupComponent: ComponentHandler = {
	prefix: "setup",
	execute: async (interaction, args, client) => {
		if (!interaction.isButton() || !interaction.guildId) return;
		if (!isAdmin(interaction)) {
			return void reply.error(interaction, t("common:error.missingPermissions"));
		}
		const guildId = interaction.guildId;

		try {
			let updated: GuildTenant;
			let warning: string | undefined;
			if (args[0] === "toggle" && args[1]) {
				const current = await getTenant(guildId);
				const outcome = await setFeatures(guildId, {
					[args[1]]: !isFeatureEnabled(current, args[1]),
				});
				updated = outcome.value;
				warning = featureWarning(outcome);
			} else if (args[0] === "baseline") {
				const outcome = await setFeatures(
					guildId,
					Object.fromEntries(BASELINE.map((k) => [k, true])),
				);
				updated = outcome.value;
				warning = featureWarning(outcome);
			} else if (args[0] === "logchannel") {
				const guild = client.guilds.cache.get(guildId);
				const channel = await guild?.channels
					.create({ name: "rostra-logs", type: ChannelType.GuildText })
					.catch(() => null);
				if (!channel) return void reply.error(interaction, t("setup:logFailed"));
				const outcome = await updateTenantWithOutcome(guildId, { logChannelId: channel.id });
				updated = outcome.value;
				if (outcome.coherence.status === "ttl-fallback") warning = t("setup:feature.degraded");
			} else {
				return;
			}

			await interaction.update({
				components: renderPanel(updated, warning),
				flags: MessageFlags.IsComponentsV2,
			});
		} catch {
			return void reply.error(interaction, t("setup:saveFailed"));
		}
	},
};

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("setup")
		.setDescription("Set up Rostra for this server")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
	cmd.addSubcommand((s) => s.setName("wizard").setDescription("Open the setup panel"));
	cmd.addSubcommand((s) =>
		s
			.setName("provision")
			.setDescription("Create the channels and roles Rostra's systems need (idempotent)"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("check")
			.setDescription("Health-check the provisioned channels and roles (read-only)"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("language")
			.setDescription("Set this server's language")
			.addStringOption((o) =>
				o
					.setName("language")
					.setDescription("Server language")
					.setRequired(true)
					.addChoices(
						...Object.values(SUPPORTED_LOCALES).map((l) => ({
							name: `${l.native} (${l.name})`.slice(0, 100),
							value: l.code,
						})),
					),
			),
	);
	return cmd;
}

const setupCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const setup: BotModule = {
	name: "setup",
	commands: [setupCommand],
	components: [setupComponent],
	i18n: {
		title: "Server Setup",
		intro:
			"Toggle systems below, apply the recommended baseline, or create a log channel. Settings save to your server's central config.",
		applyBaseline: "Apply baseline",
		createLog: "Create log channel",
		logSet: "Log channel: {channel}",
		logNone: "No log channel set yet.",
		logFailed: "I couldn't create a channel - check my Manage Channels permission.",
		saveFailed: "I couldn't save the setup change. Please check the server state before retrying.",
		"feature.degraded":
			"Saved here, but delivery to other shards is delayed. Check their state before relying on this setting.",
		"feature.provisionFailed":
			"The switch was saved, but part of the feature setup failed. Check the feature before relying on it.",
		languageSet: "🌐 Server language set to **{language}**. Bot messages here now use it.",
		languageSaved: "🌐 Server language saved as **{language}**.",
		"provision.title": "Server provisioning",
		"provision.perms": "I need these permissions first: **{perms}**. Grant them and run it again.",
		"provision.tenantFailed": "I couldn't read this server's setup state. Please try again later.",
		"provision.created": "**Created:** {items}",
		"provision.existed": "**Already there:** {items}",
		"provision.failed": "**Failed:** {items}",
		"provision.none": "none",
		"provision.mapFailed":
			"The channel and role list could not be saved. Some resources may already exist.",
		"provision.degraded":
			"Committed setup changes are visible here, but delivery to other shards is delayed.",
		"provision.retry":
			"Check the listed resources and run `/setup provision` again to repair incomplete parts.",
		"provision.hint":
			"Channels and roles are wired into their systems. Post the verify panel with `/verification panel` in the verify channel. Re-run any time to repair missing pieces.",
		"check.title": "Provisioning health",
		"check.hint":
			"Some pieces are missing or drifted. Run `/setup provision` to create and repair them.",
	},
};

export default setup;
