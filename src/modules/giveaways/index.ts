import {
	ButtonStyle,
	type ChatInputCommandInteraction,
	type Client,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { defineEvent } from "@/client/defineEvent.ts";
import { t } from "@/i18n/index.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule, ComponentHandler, RegisteredEvent, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import {
	addEntry,
	createGiveaway,
	endGiveaway,
	getActive,
	getGiveaway,
	setMessageId,
} from "./service.ts";

const log = getLogger("giveaways");
const timers = new Map<string, NodeJS.Timeout>();
const MAX_TIMEOUT = 2_147_483_000;

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(input: string): number | null {
	let total = 0;
	let found = false;
	for (const m of input.toLowerCase().matchAll(/(\d+)\s*(s|m|h|d)/g)) {
		total += Number(m[1]) * (UNIT_MS[m[2] ?? ""] ?? 0);
		found = true;
	}
	return found ? total : null;
}

function enterRow(id: string, entries: number) {
	return actionRow(
		button({
			id: `giveaway:enter:${id}`,
			label: `Enter (${entries})`,
			emoji: "🎉",
			style: ButtonStyle.Primary,
		}),
	);
}

async function endAndAnnounce(client: Client, id: string): Promise<void> {
	timers.delete(id);
	const result = await endGiveaway(id);
	if (!result) return;
	const { giveaway, winners } = result;
	const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) return;
	const announce =
		winners.length > 0
			? `🎉 **Giveaway ended!** Winner(s) of **${giveaway.prize}**: ${winners.map((w) => `<@${w}>`).join(", ")}`
			: `🎉 **Giveaway ended!** No valid entries for **${giveaway.prize}**.`;
	await channel
		.send({
			components: [container(Accent.success, [text(announce)])],
			flags: MessageFlags.IsComponentsV2,
		})
		.catch(() => {});
	if (giveaway.messageId) {
		const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
		await msg
			?.edit({
				components: [container(Accent.warn, [text(`🎉 **${giveaway.prize}** - ended.`)])],
				flags: MessageFlags.IsComponentsV2,
			})
			.catch(() => {});
	}
}

function schedule(client: Client, id: string, endsAt: Date): void {
	const existing = timers.get(id);
	if (existing) clearTimeout(existing);
	const delay = endsAt.getTime() - Date.now();
	if (delay <= 0) {
		void endAndAnnounce(client, id);
		return;
	}
	const timer = setTimeout(
		() => {
			void getGiveaway(id).then((g) => {
				if (!g || g.ended) return;
				if (g.endsAt.getTime() <= Date.now()) void endAndAnnounce(client, id);
				else schedule(client, id, g.endsAt);
			});
		},
		Math.min(delay, MAX_TIMEOUT),
	);
	timers.set(id, timer);
}

function isManager(interaction: ChatInputCommandInteraction): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("giveaway").setDescription("Run giveaways");
	cmd.addSubcommand((s) =>
		s
			.setName("start")
			.setDescription("Start a giveaway (Manage Server)")
			.addStringOption((o) =>
				o.setName("duration").setDescription("e.g. 1h, 2d, 30m").setRequired(true),
			)
			.addStringOption((o) => o.setName("prize").setDescription("Prize").setRequired(true))
			.addIntegerOption((o) =>
				o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("end")
			.setDescription("End a giveaway now (Manage Server)")
			.addStringOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("reroll")
			.setDescription("Reroll winners (Manage Server)")
			.addStringOption((o) => o.setName("id").setDescription("Giveaway ID").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List active giveaways"));
	return cmd;
}

async function execute({
	interaction,
	client,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	if (sub !== "list" && !isManager(interaction)) {
		return void reply.error(interaction, t("common:error.missingPermissions"));
	}

	switch (sub) {
		case "start": {
			const durationMs = parseDuration(interaction.options.getString("duration", true));
			if (!durationMs) return void reply.error(interaction, t("giveaways:error.duration"));
			const prize = interaction.options.getString("prize", true);
			const winners = interaction.options.getInteger("winners") ?? 1;
			const channel = interaction.channel;
			if (!channel?.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("giveaways:error.badChannel"));
			}
			const endsAt = new Date(Date.now() + durationMs);
			const giveaway = await createGiveaway({
				guildId: guild.id,
				channelId: channel.id,
				prize,
				winners,
				hostId: interaction.user.id,
				endsAt,
			});
			const message = await channel.send({
				components: [
					container(Accent.info, [
						text(`# 🎉 ${prize}`),
						text(
							`Hosted by <@${interaction.user.id}>\nWinners: **${winners}**\nEnds <t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
						),
					]),
					enterRow(giveaway.id, 0),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			await setMessageId(giveaway.id, message.id);
			schedule(client, giveaway.id, endsAt);
			return void reply.success(interaction, t("giveaways:started", { id: giveaway.id }), true);
		}
		case "end": {
			const id = interaction.options.getString("id", true);
			const giveaway = await getGiveaway(id);
			if (!giveaway || giveaway.guildId !== guild.id) {
				return void reply.error(interaction, t("giveaways:error.notFound"));
			}
			await endAndAnnounce(client, id);
			return void reply.success(interaction, t("giveaways:ended"), true);
		}
		case "reroll": {
			const id = interaction.options.getString("id", true);
			const result = await endGiveaway(id);
			if (!result || result.giveaway.guildId !== guild.id) {
				return void reply.error(interaction, t("giveaways:error.notFound"));
			}
			const channel = await client.channels.fetch(result.giveaway.channelId).catch(() => null);
			if (channel?.isTextBased() && !channel.isDMBased()) {
				const text2 =
					result.winners.length > 0
						? `🔁 **Reroll!** New winner(s) of **${result.giveaway.prize}**: ${result.winners.map((w) => `<@${w}>`).join(", ")}`
						: `🔁 **Reroll!** Still no valid entries for **${result.giveaway.prize}**.`;
				await channel
					.send({
						components: [container(Accent.success, [text(text2)])],
						flags: MessageFlags.IsComponentsV2,
					})
					.catch(() => {});
			}
			return void reply.success(interaction, t("giveaways:rerolled"), true);
		}
		case "list": {
			const active = await getActive(guild.id);
			if (active.length === 0)
				return void reply.components(interaction, [
					container(Accent.info, [text(t("giveaways:list.empty"))]),
				]);
			const lines = active.map(
				(g) =>
					`**${g.prize}** - \`${g.id}\` - ends <t:${Math.floor(g.endsAt.getTime() / 1000)}:R> - ${g.entries.length} entries`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("giveaways:list.title")), text(lines.join("\n"))]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const giveawayComponent: ComponentHandler = {
	prefix: "giveaway",
	execute: async (interaction, args) => {
		if (args[0] !== "enter" || !interaction.isButton()) return;
		const id = args[1];
		if (!id) return;
		const count = await addEntry(id, interaction.user.id);
		if (count === null) return void reply.error(interaction, t("giveaways:error.closed"));
		await reply.success(interaction, t("giveaways:entered", { count }), true);
	},
};

const resyncEvent: RegisteredEvent = defineEvent("ready", {
	once: true,
	execute: async (client) => {
		const active = await getActive();
		for (const giveaway of active) {
			if (client.guilds.cache.has(giveaway.guildId)) {
				schedule(client, giveaway.id, giveaway.endsAt);
			}
		}
		log.info({ count: active.length }, "rescheduled active giveaways");
	},
});

const giveawayCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const giveaways: BotModule = {
	name: "giveaways",
	commands: [giveawayCommand],
	components: [giveawayComponent],
	events: [resyncEvent],
	i18n: {
		started: "🎉 Giveaway started! ID: `{id}`",
		ended: "✅ Giveaway ended.",
		rerolled: "🔁 Rerolled.",
		entered: "🎉 You're entered! ({count} total)",
		"list.title": "# 🎉 Active giveaways",
		"list.empty": "No active giveaways.",
		"error.duration": "Invalid duration. Use formats like `30m`, `1h`, `2d`.",
		"error.badChannel": "Use this in a text channel.",
		"error.notFound": "No giveaway with that ID here.",
		"error.closed": "This giveaway is no longer open.",
	},
};

export default giveaways;
