import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { birthdayEvents } from "./events.ts";
import {
	getBirthday,
	getConfig,
	isValidDate,
	listForGuild,
	removeBirthday,
	setBirthday,
	upsertConfig,
} from "./service.ts";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function daysUntil(month: number, day: number, now = new Date()): number {
	const year = now.getUTCFullYear();
	let next = Date.UTC(year, month - 1, day);
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	if (next < today) next = Date.UTC(year + 1, month - 1, day);
	return Math.round((next - today) / 86_400_000);
}

function isManager(interaction: ChatInputCommandInteraction): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("birthday")
		.setDescription("Birthday announcements");
	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set your birthday")
			.addIntegerOption((o) =>
				o.setName("day").setDescription("Day").setRequired(true).setMinValue(1).setMaxValue(31),
			)
			.addIntegerOption((o) =>
				o.setName("month").setDescription("Month").setRequired(true).setMinValue(1).setMaxValue(12),
			)
			.addIntegerOption((o) =>
				o.setName("year").setDescription("Year (optional)").setMinValue(1900).setMaxValue(2025),
			),
	);
	cmd.addSubcommand((s) => s.setName("remove").setDescription("Remove your birthday"));
	cmd.addSubcommand((s) =>
		s
			.setName("view")
			.setDescription("View a birthday")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) => s.setName("next").setDescription("Upcoming birthdays"));
	cmd.addSubcommand((s) =>
		s
			.setName("channel")
			.setDescription("Announcement channel (Manage Server)")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("role")
			.setDescription("Temporary birthday role (Manage Server)")
			.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("message")
			.setDescription("Announcement message; {user} = mention (Manage Server)")
			.addStringOption((o) => o.setName("text").setDescription("Message").setRequired(true)),
	);
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
			const day = interaction.options.getInteger("day", true);
			const month = interaction.options.getInteger("month", true);
			const year = interaction.options.getInteger("year");
			if (!isValidDate(day, month)) return void reply.error(interaction, t("birthday:invalid"));
			await setBirthday(guild.id, interaction.user.id, day, month, year);
			return ok(interaction, "birthday:set", { day, month: MONTHS[month - 1] ?? `${month}` });
		}
		case "remove":
			await removeBirthday(guild.id, interaction.user.id);
			return ok(interaction, "birthday:removed");
		case "view": {
			const user = interaction.options.getUser("user") ?? interaction.user;
			const birthday = await getBirthday(guild.id, user.id);
			if (!birthday) return ok(interaction, "birthday:none", { user: user.username }, Accent.info);
			return ok(
				interaction,
				"birthday:view",
				{
					user: user.username,
					day: birthday.day,
					month: MONTHS[birthday.month - 1] ?? `${birthday.month}`,
				},
				Accent.info,
			);
		}
		case "next": {
			const all = await listForGuild(guild.id);
			if (all.length === 0) return ok(interaction, "birthday:listEmpty", {}, Accent.info);
			const sorted = all
				.map((b) => ({ b, days: daysUntil(b.month, b.day) }))
				.sort((x, y) => x.days - y.days)
				.slice(0, 10);
			const lines = sorted.map(
				({ b, days }) =>
					`<@${b.userId}> — ${b.day} ${MONTHS[b.month - 1]} (${days === 0 ? "today!" : `in ${days}d`})`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("birthday:listTitle")), text(lines.join("\n"))]),
			]);
		}
		case "channel": {
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { channelId: channel.id });
			return ok(interaction, "birthday:channelSet", { channel: `<#${channel.id}>` });
		}
		case "role": {
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const role = interaction.options.getRole("role", true);
			await upsertConfig(guild.id, { roleId: role.id });
			return ok(interaction, "birthday:roleSet", { role: role.name });
		}
		case "message": {
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const message = interaction.options.getString("text", true);
			await upsertConfig(guild.id, { message });
			return ok(interaction, "birthday:messageSet");
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const birthdayCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const birthday: BotModule = {
	name: "birthday",
	commands: [birthdayCommand],
	events: birthdayEvents,
	i18n: {
		set: "🎂 Birthday set to **{day} {month}**.",
		removed: "🗑️ Your birthday was removed.",
		view: "🎂 **{user}**'s birthday is **{day} {month}**.",
		none: "**{user}** hasn't set a birthday.",
		invalid: "That's not a valid date.",
		listTitle: "# 🎂 Upcoming birthdays",
		listEmpty: "No birthdays set yet.",
		channelSet: "📢 Birthday announcements will go to {channel}.",
		roleSet: "🎀 Birthday role set to **{role}** (granted for ~24h).",
		messageSet: "✏️ Birthday message updated.",
	},
};

export default birthday;
