import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { defineEvent } from "@/client/defineEvent.ts";
import { runWithLocale, t } from "@/i18n/index.ts";
import { SUPPORTED_LOCALES } from "@/i18n/locales.ts";
import { resolveLocale, setUserLocale } from "@/services/localization.ts";
import { recoverScheduled } from "@/services/scheduler.ts";
import type { BotModule, ComponentHandler, RegisteredEvent, SlashCommand } from "@/types/module.ts";
import {
	Accent,
	container,
	divider,
	EMOJI_FALLBACK,
	emoji,
	paginatorRow,
	reply,
	stringSelect,
	text,
} from "@/ui";
import { findCategory, HELP_CATEGORIES } from "./categories.ts";
import {
	type BotStats,
	formatBytes,
	formatUptime,
	gatherBotStats,
	gatherShardStats,
	type ShardStat,
} from "./stats.ts";

const SHARDS_PER_PAGE = 5;

function categorySelect(selectedId?: string) {
	return stringSelect(
		"help:category",
		HELP_CATEGORIES.map((c) => ({
			label: c.label,
			value: c.id,
			description: c.description,
			emoji: EMOJI_FALLBACK[c.emoji],
			default: c.id === selectedId,
		})),
		{ placeholder: t("core:help.placeholder") },
	);
}

function languageSelect() {
	return stringSelect(
		"help:lang",
		[
			{ label: t("core:help.langAuto"), value: "auto" },
			...Object.values(SUPPORTED_LOCALES).map((l) => ({
				label: `${l.native} (${l.name})`.slice(0, 100),
				value: l.code,
			})),
		],
		{ placeholder: t("core:help.langPlaceholder") },
	);
}

function helpOverview(client: BotClient) {
	const lines = HELP_CATEGORIES.map(
		(c) => `${emoji(c.emoji)} **${c.label}** - ${c.description}`,
	).join("\n");
	return [
		container(Accent.info, [
			text(`# ${emoji("info")} ${t("core:help.title")}`),
			text(
				t("core:help.intro", {
					commands: client.commands.size,
					categories: HELP_CATEGORIES.length,
				}),
			),
			divider(),
			text(lines),
		]),
		categorySelect(),
		languageSelect(),
	];
}

function helpCategory(client: BotClient, id: string) {
	const category = findCategory(id);
	if (!category) return helpOverview(client);
	const lines = category.commands
		.map((name) => {
			const json = client.commands.get(name)?.data.toJSON();
			const description = json && "description" in json ? json.description : "";
			return `**/${name}** - ${description}`;
		})
		.join("\n");
	return [
		container(Accent.info, [
			text(`## ${emoji(category.emoji)} ${category.label}`),
			text(lines || t("core:help.empty")),
		]),
		categorySelect(category.id),
	];
}

function statsPanel(s: BotStats) {
	return [
		container(Accent.info, [
			text(`# ${emoji("stats")} ${t("core:stats.title")}`),
			text(
				[
					`${emoji("servers")} **${t("core:stats.servers")}:** ${s.servers.toLocaleString()}`,
					`${emoji("users")} **${t("core:stats.users")}:** ${s.users.toLocaleString()}`,
					`${emoji("channels")} **${t("core:stats.channels")}:** ${s.channels.toLocaleString()}`,
					`${emoji("shard")} **${t("core:stats.shards")}:** ${s.shardCount} (#${s.currentShard})`,
				].join("\n"),
			),
			divider(),
			text(
				[
					`${emoji("latency")} **${t("core:stats.gateway")}:** ${s.wsPing}ms`,
					`${emoji("uptime")} **${t("core:stats.uptime")}:** ${formatUptime(s.uptimeSec)}`,
					`${emoji("ram")} **${t("core:stats.memory")}:** ${formatBytes(s.memoryBytes)}`,
					`${emoji("settings")} **${t("core:stats.commands")}:** ${s.commands}`,
				].join("\n"),
			),
		]),
	];
}

function shardsPanel(shards: ShardStat[], page: number) {
	const totalPages = Math.max(1, Math.ceil(shards.length / SHARDS_PER_PAGE));
	const clamped = Math.min(Math.max(0, page), totalPages - 1);
	const slice = shards.slice(clamped * SHARDS_PER_PAGE, (clamped + 1) * SHARDS_PER_PAGE);
	const blocks = slice
		.map((sh) =>
			[
				`${emoji("shard")} **${t("core:shards.shard", { id: sh.id })}**`,
				`${emoji("latency")} ${sh.ping}ms  ${emoji("servers")} ${sh.servers}  ${emoji("users")} ${sh.users.toLocaleString()}`,
				`${emoji("ram")} ${formatBytes(sh.memoryBytes)}  ${emoji("uptime")} ${formatUptime(sh.uptimeSec)}`,
			].join("\n"),
		)
		.join("\n\n");
	return [
		container(Accent.info, [
			text(`# ${emoji("shard")} ${t("core:shards.title")}`),
			text(blocks || t("core:shards.empty")),
		]),
		paginatorRow("shards", clamped, totalPages),
	];
}

const ping: SlashCommand = {
	data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency"),
	execute: async ({ interaction, client }) => {
		const latency = Math.max(0, Math.round(client.ws.ping));
		await reply.components(interaction, [
			container(Accent.info, [text(`${emoji("latency")} ${t("core:ping", { ms: latency })}`)]),
		]);
	},
};

const help: SlashCommand = {
	data: new SlashCommandBuilder().setName("help").setDescription("Browse commands by category"),
	execute: async ({ interaction, client }) => {
		await reply.components(interaction, helpOverview(client));
	},
};

const stats: SlashCommand = {
	data: new SlashCommandBuilder().setName("stats").setDescription("Bot statistics"),
	execute: async ({ interaction, client }) => {
		await reply.components(interaction, statsPanel(await gatherBotStats(client)));
	},
};

const shards: SlashCommand = {
	data: new SlashCommandBuilder().setName("shards").setDescription("Per-shard statistics"),
	execute: async ({ interaction, client }) => {
		await reply.components(interaction, shardsPanel(await gatherShardStats(client), 0));
	},
};

const helpComponent: ComponentHandler = {
	prefix: "help",
	execute: async (interaction, args, client) => {
		if (!interaction.isStringSelectMenu()) return;
		const value = interaction.values[0];
		if (!value) return;

		if (args[0] === "lang") {
			await setUserLocale(interaction.user.id, value === "auto" ? null : value);
			const newLocale = await resolveLocale({
				userId: interaction.user.id,
				guildId: interaction.guildId ?? undefined,
				interactionLocale: interaction.locale,
				scope: "user",
			});
			return void runWithLocale(newLocale, () =>
				interaction.update({
					components: helpOverview(client),
					flags: MessageFlags.IsComponentsV2,
				}),
			);
		}

		await interaction.update({
			components: helpCategory(client, value),
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

const shardsComponent: ComponentHandler = {
	prefix: "shards",
	execute: async (interaction, args, client) => {
		if (!interaction.isButton() || args[0] !== "page") return;
		const page = Number(args[1]);
		if (Number.isNaN(page)) return;
		await interaction.update({
			components: shardsPanel(await gatherShardStats(client), page),
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

const recoverTasksEvent: RegisteredEvent = defineEvent("ready", {
	once: true,
	execute: async (client) => {
		await recoverScheduled(client);
	},
});

const core: BotModule = {
	name: "core",
	commands: [ping, help, stats, shards],
	components: [helpComponent, shardsComponent],
	events: [recoverTasksEvent],
	i18n: {
		ping: "Pong! `{ms}ms` gateway latency.",
		"help.title": "Rostra Help",
		"help.intro":
			"**{commands}** commands across **{categories}** categories. Pick one below to see its commands.",
		"help.placeholder": "Select a category",
		"help.empty": "No commands here yet.",
		"help.langPlaceholder": "🌐 Change your language",
		"help.langAuto": "Auto (follow the server)",
		"stats.title": "Rostra Statistics",
		"stats.servers": "Servers",
		"stats.users": "Users",
		"stats.channels": "Channels",
		"stats.shards": "Shards",
		"stats.gateway": "Gateway",
		"stats.uptime": "Uptime",
		"stats.memory": "Memory",
		"stats.commands": "Commands",
		"shards.title": "Shard Statistics",
		"shards.shard": "Shard {id}",
		"shards.empty": "No shard data.",
	},
};

export default core;
