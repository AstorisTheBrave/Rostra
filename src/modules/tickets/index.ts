import type { TicketConfig } from "@prisma/client";
import {
	AttachmentBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type TextChannel,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { registerTaskHandler, schedule } from "@/services/scheduler.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import { ticketEvents } from "./events.ts";
import {
	type CategorySpec,
	PRIORITY_EMOJI,
	REOPEN_WINDOW_MS,
	STATE_EMOJI,
	type TicketPriority,
} from "./queue.ts";
import {
	archiveDeleteTask,
	claimTicket,
	closeTicket,
	createTicket,
	escalateTicket,
	getConfig,
	getDashboard,
	getGuildCategories,
	getStaffLeaderboard,
	getStaffStats,
	getTicket,
	isSupport,
	notifyWatchers,
	reopenTicket,
	setGuildCategories,
	setTicketPriority,
	tagTicket,
	transferTicket,
	upsertConfig,
	watchTicket,
} from "./service.ts";

const TICKET_ARCHIVE_DELETE = "ticket_archive_delete";

// Delete archived ticket channels when their reopen window expires (durable across restarts).
registerTaskHandler(TICKET_ARCHIVE_DELETE, archiveDeleteTask);

function panelRow(categories: CategorySpec[]) {
	return actionRow(
		...categories.map((c) =>
			button({
				id: `ticket:open:${c.key}`,
				label: c.label,
				emoji: c.emoji,
				style: ButtonStyle.Primary,
			}),
		),
	);
}

function controlRow() {
	return actionRow(
		button({ id: "ticket:claim", label: "Claim", style: ButtonStyle.Secondary }),
		button({ id: "ticket:escalate", label: "Escalate", emoji: "🚨", style: ButtonStyle.Secondary }),
		button({ id: "ticket:close", label: "Close", emoji: "🔒", style: ButtonStyle.Danger }),
	);
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("ticket")
		.setDescription("Support ticket system")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) => s.setName("enable").setDescription("Enable tickets"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable tickets"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show ticket settings"));
	cmd.addSubcommand((s) =>
		s.setName("panel").setDescription("Post the ticket panel in this channel"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("category")
			.setDescription("Category new tickets are created under")
			.addChannelOption((o) => o.setName("category").setDescription("Category").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("logchannel")
			.setDescription("Where closed-ticket logs go")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("close")
			.setDescription("Close the current ticket")
			.addStringOption((o) => o.setName("reason").setDescription("Why it's being closed")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("reopen")
			.setDescription("Reopen a recently closed ticket (within 7 days)")
			.addIntegerOption((o) =>
				o.setName("number").setDescription("Ticket number").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) => s.setName("claim").setDescription("Claim the current ticket"));
	cmd.addSubcommand((s) =>
		s
			.setName("priority")
			.setDescription("Set the current ticket's priority")
			.addStringOption((o) =>
				o
					.setName("level")
					.setDescription("Priority")
					.setRequired(true)
					.addChoices(
						{ name: "Low", value: "LOW" },
						{ name: "Normal", value: "NORMAL" },
						{ name: "High", value: "HIGH" },
						{ name: "Urgent", value: "URGENT" },
					),
			),
	);
	cmd.addSubcommand((s) =>
		s.setName("escalate").setDescription("Bump the current ticket up one priority level"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("transfer")
			.setDescription("Move the current ticket to another queue")
			.addStringOption((o) =>
				o
					.setName("queue")
					.setDescription("Target queue key (see /ticket queue list)")
					.setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s.setName("watch").setDescription("Get DM'd when this ticket escalates or closes"),
	);
	cmd.addSubcommand((s) => s.setName("unwatch").setDescription("Stop watching this ticket"));
	cmd.addSubcommand((s) => s.setName("info").setDescription("Show the current ticket's details"));
	cmd.addSubcommand((s) =>
		s.setName("dashboard").setDescription("Live overview of all open tickets"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("staffstats")
			.setDescription("Ticket throughput per staff member")
			.addUserOption((o) =>
				o.setName("user").setDescription("Staff member (empty for a leaderboard)"),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a user to the current ticket")
			.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("queue")
			.setDescription("Manage custom ticket queues")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add or update a queue")
					.addStringOption((o) =>
						o.setName("key").setDescription("Short key (a-z, 0-9)").setRequired(true),
					)
					.addStringOption((o) =>
						o.setName("label").setDescription("Display label").setRequired(true),
					)
					.addStringOption((o) => o.setName("emoji").setDescription("Button emoji"))
					.addIntegerOption((o) =>
						o.setName("sla").setDescription("SLA in minutes").setMinValue(5).setMaxValue(10080),
					),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a queue")
					.addStringOption((o) => o.setName("key").setDescription("Queue key").setRequired(true)),
			)
			.addSubcommand((s) => s.setName("list").setDescription("List the queues")),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("tag")
			.setDescription("Tag the current ticket")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add a tag")
					.addStringOption((o) => o.setName("tag").setDescription("Tag").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a tag")
					.addStringOption((o) => o.setName("tag").setDescription("Tag").setRequired(true)),
			),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("supportrole")
			.setDescription("Roles that can manage tickets")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add a support role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a support role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<TicketConfig> {
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
	const member = interaction.member as GuildMember | null;
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === "supportrole") {
		const role = interaction.options.getRole("role", true);
		const cfg = await ensureConfig(guild.id);
		const next =
			sub === "add"
				? uniq([...cfg.supportRoleIds, role.id])
				: cfg.supportRoleIds.filter((r) => r !== role.id);
		await upsertConfig(guild.id, { supportRoleIds: next });
		return ok(interaction, `tickets:supportrole.${sub}`, { role: role.name });
	}

	if (group === "queue") {
		if (sub === "list") {
			const cats = await getGuildCategories(guild.id);
			const body = cats
				.map((c) => `${c.emoji} \`${c.key}\` ${c.label} - SLA ${c.slaMinutes}m`)
				.join("\n");
			return void reply.components(interaction, [
				container(Accent.info, [text(t("tickets:queue.title")), text(body)]),
			]);
		}
		const cats = await getGuildCategories(guild.id);
		const key = interaction.options
			.getString("key", true)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "")
			.slice(0, 20);
		if (!key) return void reply.error(interaction, t("tickets:queue.badKey"));
		if (sub === "add") {
			const label = interaction.options.getString("label", true);
			const next: CategorySpec[] = [
				...cats.filter((c) => c.key !== key),
				{
					key,
					label,
					emoji: interaction.options.getString("emoji") ?? "🎫",
					slaMinutes: interaction.options.getInteger("sla") ?? 60,
				},
			].slice(0, 5);
			await setGuildCategories(guild.id, next);
			return ok(interaction, "tickets:queue.added", { key, label });
		}
		const next = cats.filter((c) => c.key !== key);
		if (next.length === cats.length) {
			return void reply.error(interaction, t("tickets:queue.notFound", { key }));
		}
		await setGuildCategories(guild.id, next);
		return ok(interaction, "tickets:queue.removed", { key });
	}

	if (group === "tag") {
		const channel = interaction.channel as TextChannel | null;
		if (!channel || !member || !isSupport(member, await ensureConfig(guild.id))) {
			return void reply.error(interaction, t("common:error.missingPermissions"));
		}
		const tag = interaction.options.getString("tag", true);
		const next = await tagTicket(channel.id, tag, sub === "add");
		if (next === null) return void reply.error(interaction, t("tickets:error.notTicket"));
		return ok(interaction, `tickets:tag.${sub}`, {
			tag,
			tags: next.length ? next.join(", ") : "none",
		});
	}

	switch (sub) {
		case "enable":
			await upsertConfig(guild.id, { enabled: true });
			return ok(interaction, "tickets:enabled");
		case "disable":
			await upsertConfig(guild.id, { enabled: false });
			return ok(interaction, "tickets:disabled");
		case "category": {
			const category = interaction.options.getChannel("category", true);
			await upsertConfig(guild.id, { categoryId: category.id });
			return ok(interaction, "tickets:category.set", { name: category.name ?? "category" });
		}
		case "logchannel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { logChannelId: channel.id });
			return ok(interaction, "tickets:logchannel.set", { channel: `<#${channel.id}>` });
		}
		case "panel": {
			const cfg = await ensureConfig(guild.id);
			const channel = interaction.channel;
			if (!channel?.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("tickets:error.badChannel"));
			}
			await channel.send({
				components: [
					container(Accent.info, [text(`# ${cfg.panelTitle}`), text(cfg.panelMessage)]),
					panelRow(await getGuildCategories(guild.id)),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			return ok(interaction, "tickets:panel.posted");
		}
		case "reopen": {
			if (!member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const number = interaction.options.getInteger("number", true);
			const channelId = await reopenTicket(guild, number);
			return channelId
				? ok(interaction, "tickets:reopened", { channel: `<#${channelId}>` })
				: void reply.error(interaction, t("tickets:reopen.notFound", { number }));
		}
		case "claim": {
			const channel = interaction.channel;
			if (
				!channel ||
				!("name" in channel) ||
				!member ||
				!isSupport(member, await ensureConfig(guild.id))
			) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const claimed = await claimTicket(channel.id, interaction.user.id);
			return claimed
				? ok(interaction, "tickets:claimed", { user: interaction.user.tag })
				: void reply.error(interaction, t("tickets:error.notTicket"));
		}
		case "priority": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const level = interaction.options.getString("level", true) as TicketPriority;
			const done = await setTicketPriority(channel, level);
			return done
				? ok(interaction, "tickets:priority.set", { level: level.toLowerCase() })
				: void reply.error(interaction, t("tickets:error.notTicket"));
		}
		case "escalate": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const next = await escalateTicket(channel);
			if (!next) return void reply.error(interaction, t("tickets:error.notTicket"));
			await notifyWatchers(channel, `🚨 A ticket in ${guild.name} was escalated to ${next}.`);
			return ok(interaction, "tickets:escalated", { level: next.toLowerCase() });
		}
		case "watch":
		case "unwatch": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const count = await watchTicket(channel.id, interaction.user.id, sub === "watch");
			if (count === null) return void reply.error(interaction, t("tickets:error.notTicket"));
			return ok(interaction, sub === "watch" ? "tickets:watching" : "tickets:unwatching", {
				count,
			});
		}
		case "transfer": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const spec = await transferTicket(
				channel,
				interaction.options.getString("queue", true).toLowerCase(),
			);
			return spec
				? ok(interaction, "tickets:transferred", { queue: spec.label })
				: void reply.error(interaction, t("tickets:transfer.fail"));
		}
		case "info": {
			const channel = interaction.channel;
			if (!channel || !("id" in channel)) {
				return void reply.error(interaction, t("tickets:error.notTicket"));
			}
			const ticket = await getTicket(channel.id);
			if (!ticket) return void reply.error(interaction, t("tickets:error.notTicket"));
			const opened = Math.floor(ticket.createdAt.getTime() / 1000);
			const lines = [
				`**Ticket:** #${ticket.number}`,
				`**Opener:** <@${ticket.userId}>`,
				`**Status:** ${ticket.status} • **Priority:** ${ticket.priority}`,
				`**Queue:** ${ticket.category} • **SLA:** ${ticket.slaMinutes}m`,
				`**Claimed by:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "unclaimed"}`,
				`**Tags:** ${ticket.tags.length ? ticket.tags.map((x) => `\`${x}\``).join(" ") : "none"}`,
				`**Opened:** <t:${opened}:R>`,
			];
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("tickets:info.title", { number: ticket.number })),
					text(lines.join("\n")),
				]),
			]);
		}
		case "dashboard": {
			if (!member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const d = await getDashboard(guild.id);
			const cats = await getGuildCategories(guild.id);
			const cat = (k: string) => cats.find((c) => c.key === k) ?? { emoji: "🎫", label: k };
			const emoji = (map: Record<string, string>, key: string) => map[key] ?? "";
			const counts = (
				m: Record<string, number>,
				glyph: (k: string) => string,
				label: (k: string) => string = (k) => k,
			) =>
				Object.entries(m)
					.sort((a, b) => b[1] - a[1])
					.map(([k, v]) => `${glyph(k)} ${label(k)} **${v}**`)
					.join(" • ") || "none";
			const lines = [
				`**Open:** ${d.total} • **Unassigned:** ${d.unassigned} • **SLA breached:** ${d.slaBreached}`,
				`**Priority:** ${counts(d.byPriority, (k) => emoji(PRIORITY_EMOJI, k))}`,
				`**Status:** ${counts(d.byStatus, (k) => emoji(STATE_EMOJI, k))}`,
				`**Queues:** ${counts(
					d.byCategory,
					(k) => cat(k).emoji,
					(k) => cat(k).label,
				)}`,
				`**Workload:** ${d.byAssignee.length ? d.byAssignee.map((a) => `<@${a.id}> **${a.count}**`).join(" • ") : "no assignments"}`,
			];
			return void reply.components(interaction, [
				container(Accent.info, [text(t("tickets:dashboard.title")), text(lines.join("\n"))]),
			]);
		}
		case "staffstats": {
			if (!member || !isSupport(member, await ensureConfig(guild.id))) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const who = interaction.options.getUser("user");
			if (who) {
				const s = await getStaffStats(guild.id, who.id);
				return void reply.components(interaction, [
					container(Accent.info, [
						text(t("tickets:staffstats.userTitle", { user: who.tag })),
						text(
							`**Claimed:** ${s.claimed} • **Closed:** ${s.closed} • **Open assigned:** ${s.openAssigned}`,
						),
					]),
				]);
			}
			const board = await getStaffLeaderboard(guild.id);
			const body = board.length
				? board.map((r, i) => `**${i + 1}.** <@${r.id}> - ${r.closed} closed`).join("\n")
				: t("tickets:staffstats.none");
			return void reply.components(interaction, [
				container(Accent.info, [text(t("tickets:staffstats.boardTitle")), text(body)]),
			]);
		}
		case "add": {
			const channel = interaction.channel as TextChannel | null;
			const user = interaction.options.getUser("user", true);
			if (!channel || !("permissionOverwrites" in channel)) {
				return void reply.error(interaction, t("tickets:error.notTicket"));
			}
			await channel.permissionOverwrites.edit(user.id, {
				ViewChannel: true,
				SendMessages: true,
				ReadMessageHistory: true,
			});
			return ok(interaction, "tickets:added", { user: user.tag });
		}
		case "close": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !("name" in channel)) {
				return void reply.error(interaction, t("tickets:error.notTicket"));
			}
			await closeAndArchive(
				channel,
				interaction.user.tag,
				interaction.options.getString("reason") ?? undefined,
			);
			return void reply.success(interaction, t("tickets:closing"), true);
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "tickets:status.unconfigured");
			const lines = [
				t("tickets:status.title"),
				t("tickets:status.line", {
					enabled: cfg.enabled ? "on" : "off",
					category: cfg.categoryId ? `<#${cfg.categoryId}>` : "none",
					log: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "none",
					roles: cfg.supportRoleIds.length,
				}),
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

async function closeAndArchive(
	channel: TextChannel,
	closedBy: string,
	reason?: string,
): Promise<void> {
	const info = await closeTicket(channel, closedBy, reason);
	if (!info) {
		setTimeout(() => void channel.delete().catch(() => {}), 5000);
		return;
	}
	await notifyWatchers(
		channel,
		`🔒 Ticket #${info.number} in ${channel.guild.name} was closed by ${closedBy}.`,
	);
	const config = await getConfig(channel.guild.id);

	// Log the close with a summary and the transcript file.
	if (config?.logChannelId) {
		const logChannel = await channel.guild.channels.fetch(config.logChannelId).catch(() => null);
		if (logChannel?.isTextBased()) {
			const summary = [
				`**Ticket #${info.number}** • opener <@${info.userId}> • closed by ${closedBy}`,
				`**Category:** ${info.category} • **Duration:** ${info.durationMins}m • **First response:** ${info.firstResponseMins ?? "-"}m • **Messages:** ${info.messageCount}`,
				...(reason ? [`**Reason:** ${reason}`] : []),
			].join("\n");
			await logChannel
				.send({
					components: [container(Accent.warn, [text("## 🔒 Ticket closed"), text(summary)])],
					flags: MessageFlags.IsComponentsV2,
				})
				.catch(() => {});
			const file = new AttachmentBuilder(Buffer.from(info.transcript, "utf8"), {
				name: `transcript-${info.number}.txt`,
			});
			await logChannel.send({ files: [file] }).catch(() => {});
		}
	}

	// DM the opener a closing notice, with the reopen window.
	const opener = await channel.client.users.fetch(info.userId).catch(() => null);
	await opener
		?.send({
			components: [
				container(Accent.info, [
					text(`## 🔒 Your ticket #${info.number} in ${channel.guild.name} was closed`),
					text(
						`${reason ? `**Reason:** ${reason}\n` : ""}A staff member can reopen it within 7 days with \`/ticket reopen ${info.number}\`.`,
					),
				]),
			],
			flags: MessageFlags.IsComponentsV2,
		})
		.catch(() => {});

	// Archive instead of deleting: lock the opener out, mark the name, and schedule a
	// durable delete after the reopen window so the ticket can be reopened until then.
	await channel.permissionOverwrites.edit(info.userId, { SendMessages: false }).catch(() => {});
	await channel
		.setName(`${channel.name.replace(/-(?:l|h|u)$/, "")}-closed`.slice(0, 95))
		.catch(() => {});
	await schedule(
		{
			type: TICKET_ARCHIVE_DELETE,
			runAt: new Date(Date.now() + REOPEN_WINDOW_MS),
			guildId: channel.guild.id,
			payload: { channelId: channel.id },
		},
		channel.client,
	).catch(() => {});
}

const ticketComponents: ComponentHandler = {
	prefix: "ticket",
	execute: async (interaction, args, _client) => {
		const action = args[0];
		const guild = interaction.guild;
		if (!guild || !interaction.isButton()) return;
		const config = await getConfig(guild.id);

		if (action === "open") {
			if (!config?.enabled) {
				return void reply.error(interaction, t("tickets:error.disabled"));
			}
			const result = await createTicket(guild, config, interaction.user, args[1] ?? "general");
			if (!result.ok) return void reply.error(interaction, t(result.messageKey));
			await result.channel.send({
				components: [
					container(Accent.success, [
						text(`<@${interaction.user.id}>`),
						text(`${result.category.emoji} **${result.category.label}**\n${config.openMessage}`),
						controlRow(),
					]),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			return void reply.success(
				interaction,
				t("tickets:opened", { channel: `<#${result.channel.id}>` }),
				true,
			);
		}

		const member = interaction.member as GuildMember | null;
		const channel = interaction.channel as TextChannel | null;
		if (!channel || !config) return;

		if (action === "claim") {
			if (!member || !isSupport(member, config)) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const claimed = await claimTicket(channel.id, interaction.user.id);
			return claimed
				? void reply.success(interaction, t("tickets:claimed", { user: interaction.user.tag }))
				: void reply.error(interaction, t("tickets:error.notTicket"));
		}

		if (action === "escalate") {
			if (!member || !isSupport(member, config)) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const next = await escalateTicket(channel);
			if (!next) return void reply.error(interaction, t("tickets:error.notTicket"));
			await notifyWatchers(channel, `🚨 A ticket in ${guild.name} was escalated to ${next}.`);
			return void reply.success(interaction, t("tickets:escalated", { level: next.toLowerCase() }));
		}

		if (action === "close") {
			const isOwner = await import("@/services/database.ts").then(({ getPrisma }) =>
				getPrisma().ticket.findUnique({ where: { channelId: channel.id } }),
			);
			const allowed =
				(member && isSupport(member, config)) || isOwner?.userId === interaction.user.id;
			if (!allowed) return void reply.error(interaction, t("common:error.missingPermissions"));
			await reply.success(interaction, t("tickets:closing"), true);
			await closeAndArchive(channel, interaction.user.tag);
		}
	},
};

const ticketCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const tickets: BotModule = {
	name: "tickets",
	commands: [ticketCommand],
	components: [ticketComponents],
	events: ticketEvents,
	i18n: {
		enabled: "🎫 Tickets **enabled**.",
		disabled: "🎫 Tickets **disabled**.",
		"category.set": "📂 Ticket category set to **{name}**.",
		"logchannel.set": "📋 Ticket log channel set to {channel}.",
		"panel.posted": "✅ Ticket panel posted.",
		"supportrole.add": "✅ **{role}** can now manage tickets.",
		"supportrole.remove": "➖ **{role}** can no longer manage tickets.",
		opened: "🎫 Your ticket is ready: {channel}",
		claimed: "🙋 Ticket claimed by **{user}**.",
		"priority.set": "🎚️ Priority set to **{level}**.",
		escalated: "🚨 Ticket escalated to **{level}**.",
		transferred: "🔀 Ticket moved to the **{queue}** queue.",
		"transfer.fail": "Run this in a ticket and use a valid queue key (see `/ticket queue list`).",
		"queue.title": "# 🎫 Ticket queues",
		"queue.added": "✅ Queue **{label}** (`{key}`) saved.",
		"queue.removed": "➖ Queue `{key}` removed.",
		"queue.notFound": "No queue with key `{key}`.",
		"queue.badKey": "Queue key must contain letters or numbers.",
		"info.title": "# 🎫 Ticket #{number}",
		reopened: "♻️ Ticket reopened: {channel}",
		"reopen.notFound":
			"No reopenable ticket #{number} (it may have been deleted after the 7-day window).",
		"dashboard.title": "# 🎟️ Ticket dashboard",
		watching:
			"👀 You're watching this ticket ({count} watching). You'll be DM'd on escalate/close.",
		unwatching: "🙈 You stopped watching this ticket ({count} watching).",
		"staffstats.userTitle": "# 📊 Ticket stats for {user}",
		"staffstats.boardTitle": "# 📊 Top ticket closers",
		"staffstats.none": "No closed tickets yet.",
		"tag.add": "🏷️ Added tag **{tag}**. Tags: {tags}",
		"tag.remove": "🏷️ Removed tag **{tag}**. Tags: {tags}",
		added: "➕ Added **{user}** to the ticket.",
		closing: "🔒 Closing this ticket…",
		"status.title": "# 🎫 Ticket settings",
		"status.line":
			"**Enabled:** {enabled} • **Category:** {category}\n**Log:** {log} • **Support roles:** {roles}",
		"status.unconfigured": "Tickets are not set up. Use `/ticket enable` and `/ticket panel`.",
		"error.disabled": "The ticket system is disabled here.",
		"error.alreadyOpen": "You already have an open ticket.",
		"error.createFailed": "Couldn't create the ticket channel - check my permissions.",
		"error.notTicket": "This isn't a ticket channel.",
		"error.badChannel": "Use this in a text channel.",
	},
};

export default tickets;
