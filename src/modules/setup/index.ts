import type { GuildTenant } from "@prisma/client";
import {
	ButtonStyle,
	ChannelType,
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { getTenant, isFeatureEnabled, setFeatures, updateTenant } from "@/services/tenant.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
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
} from "@/ui";

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

function renderPanel(tenant: GuildTenant) {
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
			divider(),
			text(`${emoji("logging")} ${logLine}`),
		]),
		...settingsPanel("setup", items),
		actionRow(
			button({ id: "setup:baseline", label: t("setup:applyBaseline"), style: ButtonStyle.Primary }),
			button({
				id: "setup:logchannel",
				label: t("setup:createLog"),
				style: ButtonStyle.Secondary,
			}),
		),
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

		if (args[0] === "toggle" && args[1]) {
			const current = await getTenant(guildId);
			await setFeatures(guildId, { [args[1]]: !isFeatureEnabled(current, args[1]) });
		} else if (args[0] === "baseline") {
			await setFeatures(guildId, Object.fromEntries(BASELINE.map((k) => [k, true])));
		} else if (args[0] === "logchannel") {
			const guild = client.guilds.cache.get(guildId);
			const channel = await guild?.channels
				.create({ name: "rostra-logs", type: ChannelType.GuildText })
				.catch(() => null);
			if (!channel) return void reply.error(interaction, t("setup:logFailed"));
			await updateTenant(guildId, { logChannelId: channel.id });
		} else {
			return;
		}

		const updated = await getTenant(guildId);
		await interaction.update({
			components: renderPanel(updated),
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

const setupCommand: SlashCommand = {
	data: new SlashCommandBuilder()
		.setName("setup")
		.setDescription("Set up Rostra for this server")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
	},
};

export default setup;
