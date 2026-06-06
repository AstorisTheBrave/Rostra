import {
	type ChatInputCommandInteraction,
	type Client,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { defineEvent } from "@/client/defineEvent.ts";
import { t } from "@/i18n/index.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule, RegisteredEvent, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import {
	cancelReminder,
	createReminder,
	deleteReminder,
	getPendingReminders,
	getReminder,
	listUserReminders,
	MAX_REMINDER_MS,
	parseDuration,
} from "./service.ts";

const log = getLogger("reminders");
const timers = new Map<string, NodeJS.Timeout>();
const MAX_TIMEOUT = 2_147_483_000;

function clearTimer(id: string): void {
	const existing = timers.get(id);
	if (existing) {
		clearTimeout(existing);
		timers.delete(id);
	}
}

async function fire(client: Client, id: string): Promise<void> {
	timers.delete(id);
	const reminder = await getReminder(id);
	if (!reminder) return;
	const body = `⏰ <@${reminder.userId}>, here's your reminder:\n\n${reminder.message}`;
	const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
	if (channel?.isTextBased() && !channel.isDMBased()) {
		await channel
			.send({
				components: [container(Accent.info, [text(body)])],
				flags: MessageFlags.IsComponentsV2,
				allowedMentions: { users: [reminder.userId] },
			})
			.catch(() => {});
	} else {
		const user = await client.users.fetch(reminder.userId).catch(() => null);
		await user
			?.send({
				components: [container(Accent.info, [text(`⏰ Reminder:\n\n${reminder.message}`)])],
				flags: MessageFlags.IsComponentsV2,
			})
			.catch(() => {});
	}
	await deleteReminder(id);
}

function schedule(client: Client, id: string, dueAt: Date): void {
	clearTimer(id);
	const delay = dueAt.getTime() - Date.now();
	if (delay <= 0) {
		void fire(client, id);
		return;
	}
	const timer = setTimeout(
		() => {
			void getReminder(id).then((r) => {
				if (!r) return;
				if (r.dueAt.getTime() <= Date.now()) void fire(client, id);
				else schedule(client, id, r.dueAt);
			});
		},
		Math.min(delay, MAX_TIMEOUT),
	);
	timers.set(id, timer);
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("reminder")
		.setDescription("Set personal reminders");
	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set a reminder")
			.addStringOption((o) =>
				o.setName("when").setDescription("e.g. 10m, 1h30m, 2d").setRequired(true),
			)
			.addStringOption((o) =>
				o.setName("message").setDescription("What to remind you about").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List your reminders here"));
	cmd.addSubcommand((s) =>
		s
			.setName("cancel")
			.setDescription("Cancel a reminder")
			.addStringOption((o) => o.setName("id").setDescription("Reminder ID").setRequired(true)),
	);
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

	switch (sub) {
		case "set": {
			const durationMs = parseDuration(interaction.options.getString("when", true));
			if (!durationMs || durationMs < 1000) {
				return void reply.error(interaction, t("reminders:error.duration"));
			}
			if (durationMs > MAX_REMINDER_MS) {
				return void reply.error(interaction, t("reminders:error.tooLong"));
			}
			const channel = interaction.channel;
			if (!channel?.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("reminders:error.badChannel"));
			}
			const message = interaction.options.getString("message", true).slice(0, 1500);
			const dueAt = new Date(Date.now() + durationMs);
			const reminder = await createReminder({
				userId: interaction.user.id,
				guildId: guild.id,
				channelId: channel.id,
				message,
				dueAt,
			});
			schedule(client, reminder.id, dueAt);
			return void reply.success(
				interaction,
				t("reminders:set", {
					when: `<t:${Math.floor(dueAt.getTime() / 1000)}:R>`,
					id: reminder.id,
				}),
				true,
			);
		}
		case "list": {
			const reminders = await listUserReminders(interaction.user.id, guild.id);
			if (reminders.length === 0) {
				return void reply.components(interaction, [
					container(Accent.info, [text(t("reminders:list.empty"))]),
				]);
			}
			const lines = reminders.map(
				(r) =>
					`\`${r.id}\` - <t:${Math.floor(r.dueAt.getTime() / 1000)}:R> - ${r.message.slice(0, 80)}`,
			);
			return void reply.components(
				interaction,
				[container(Accent.info, [text(t("reminders:list.title")), text(lines.join("\n"))])],
				true,
			);
		}
		case "cancel": {
			const id = interaction.options.getString("id", true);
			const removed = await cancelReminder(id, interaction.user.id);
			if (!removed) return void reply.error(interaction, t("reminders:error.notFound"));
			clearTimer(id);
			return void reply.success(interaction, t("reminders:cancelled"), true);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const resyncEvent: RegisteredEvent = defineEvent("ready", {
	once: true,
	execute: async (client) => {
		const pending = await getPendingReminders();
		let scheduled = 0;
		for (const reminder of pending) {
			if (client.guilds.cache.has(reminder.guildId)) {
				schedule(client, reminder.id, reminder.dueAt);
				scheduled++;
			}
		}
		log.info({ count: scheduled }, "rescheduled pending reminders");
	},
});

const reminderCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const reminders: BotModule = {
	name: "reminders",
	commands: [reminderCommand],
	events: [resyncEvent],
	i18n: {
		set: "⏰ Reminder set for {when}. ID: `{id}`",
		cancelled: "🗑️ Reminder cancelled.",
		"list.title": "# ⏰ Your reminders",
		"list.empty": "You have no reminders here.",
		"error.duration": "Invalid duration. Use formats like `10m`, `1h30m`, `2d` (minimum 1 second).",
		"error.tooLong": "Reminders can be at most 365 days out.",
		"error.badChannel": "Use this in a server text channel.",
		"error.notFound": "No reminder with that ID belongs to you.",
	},
};

export default reminders;
