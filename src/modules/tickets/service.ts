import type { Prisma, TicketConfig } from "@prisma/client";
import {
	ChannelType,
	type Client,
	type Guild,
	type GuildMember,
	PermissionFlagsBits,
	type TextChannel,
	type User,
} from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { isBotOwner } from "@/services/permissions.ts";
import {
	type CategorySpec,
	escalatePriority,
	PRIORITY_SUFFIX,
	parseCategories,
	REOPEN_WINDOW_MS,
	resolveCategory,
	type TicketPriority,
	ticketChannelName,
} from "./queue.ts";

const log = getLogger("tickets");

const cache = new Map<string, TicketConfig | null>();

export async function getConfig(guildId: string): Promise<TicketConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.ticketConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load ticket config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<TicketConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<TicketConfig> {
	const cfg = await getPrisma().ticketConfig.upsert({
		where: { guildId },
		create: { guildId, ...data } as Prisma.TicketConfigUncheckedCreateInput,
		update: data as Prisma.TicketConfigUncheckedUpdateInput,
	});
	cache.set(guildId, cfg);
	return cfg;
}

export function invalidate(guildId: string): void {
	cache.delete(guildId);
}

/** The guild's ticket queues (custom if configured, else the built-in defaults). */
export async function getGuildCategories(guildId: string): Promise<CategorySpec[]> {
	const config = await getConfig(guildId);
	return parseCategories(config?.categories);
}

/** Persist a guild's custom ticket queues (sanitised + capped on read). */
export async function setGuildCategories(guildId: string, cats: CategorySpec[]): Promise<void> {
	await upsertConfig(guildId, { categories: cats as unknown as TicketConfig["categories"] });
}

// Hot-path cache so the global messageCreate listener does not hit the DB for every
// message: known ticket channels are recorded; everything else is remembered as a
// non-ticket after one lookup so normal channels are queried at most once.
const ticketChannels = new Set<string>();
const notTicketChannels = new Set<string>();
const operations = new Map<string, Promise<void>>();

export async function withTicketLock<T>(channelId: string, action: () => Promise<T>): Promise<T> {
	const prior = operations.get(channelId) ?? Promise.resolve();
	let release = () => {};
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	operations.set(channelId, next);
	await prior;
	try {
		return await action();
	} finally {
		release();
		if (operations.get(channelId) === next) operations.delete(channelId);
	}
}

export function markTicketChannel(channelId: string): void {
	ticketChannels.add(channelId);
	notTicketChannels.delete(channelId);
}

export function unmarkTicketChannel(channelId: string): void {
	ticketChannels.delete(channelId);
}

/**
 * Capture a message posted in a ticket channel for the transcript, and advance the
 * ticket's activity timestamps. Cheap for non-ticket channels (cached miss). No-op
 * outside an open ticket.
 */
export async function recordTicketMessage(input: {
	channelId: string;
	guildId: string;
	authorId: string;
	authorTag: string;
	content: string;
	member?: GuildMember | null;
	resolveMember?: () => Promise<GuildMember | null>;
	createdAt?: Date;
}): Promise<void> {
	if (notTicketChannels.has(input.channelId)) return;
	const prisma = getPrisma();
	const ticket = await prisma.ticket
		.findUnique({ where: { channelId: input.channelId } })
		.catch(() => null);
	if (!ticket?.open) {
		ticketChannels.delete(input.channelId);
		if (notTicketChannels.size < 10_000) notTicketChannels.add(input.channelId);
		return;
	}
	ticketChannels.add(input.channelId);
	const messageAt = input.createdAt ?? new Date();
	await prisma.ticketMessage
		.create({
			data: {
				channelId: input.channelId,
				guildId: input.guildId,
				authorId: input.authorId,
				authorTag: input.authorTag,
				content: input.content.slice(0, 1900),
				createdAt: messageAt,
			},
		})
		.catch(() => {});
	let firstResponse = false;
	if (
		ticket.userId !== input.authorId &&
		(!ticket.firstResponseAt || ticket.firstResponseAt > messageAt)
	) {
		const config = await getConfig(input.guildId);
		const member = input.member ?? (await input.resolveMember?.());
		firstResponse = !!config && !!member && isSupport(member, config);
	}
	await prisma.ticket
		.updateMany({
			where: { channelId: input.channelId, open: true },
			data: { lastActivityAt: messageAt },
		})
		.catch(() => {});
	if (firstResponse) {
		await prisma.ticket
			.updateMany({
				where: {
					channelId: input.channelId,
					open: true,
					OR: [{ firstResponseAt: null }, { firstResponseAt: { gt: messageAt } }],
				},
				data: { firstResponseAt: messageAt },
			})
			.catch(() => {});
	}
}

/** Build a plain-text transcript of a ticket from its captured messages. */
async function buildTranscript(
	channelId: string,
	ticket: { number: number; userId: string; category: string; priority: string; createdAt: Date },
	closedAt: Date,
): Promise<string> {
	const msgs = await getPrisma()
		.ticketMessage.findMany({ where: { channelId }, orderBy: { createdAt: "asc" }, take: 2000 })
		.catch(() => []);
	const header = [
		"Rostra Ticket Transcript",
		`Ticket:   #${ticket.number}`,
		`Opener:   ${ticket.userId}`,
		`Category: ${ticket.category}`,
		`Priority: ${ticket.priority}`,
		`Opened:   ${ticket.createdAt.toISOString()}`,
		`Closed:   ${closedAt.toISOString()}`,
		"-".repeat(56),
	].join("\n");
	const lines = msgs.map(
		(m) =>
			`[${m.createdAt.toISOString().slice(0, 19)}] ${m.authorTag} (${m.authorId}): ${m.content}`,
	);
	return `${header}\n\n${lines.length ? lines.join("\n") : "(no messages captured)"}\n`;
}

/** Whether a member may manage tickets (a support role or Manage Server). */
export function isSupport(member: GuildMember, config: TicketConfig): boolean {
	if (isBotOwner(member.id)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
	return config.supportRoleIds.some((r) => member.roles.cache.has(r));
}

async function nextNumber(guildId: string): Promise<number> {
	const counter = await getPrisma().guildTicketCounter.upsert({
		where: { guildId },
		create: { guildId, count: 1 },
		update: { count: { increment: 1 } },
	});
	return counter.count;
}

export type CreateResult =
	| { ok: true; channel: TextChannel; number: number; category: CategorySpec }
	| { ok: false; messageKey: string };

export async function createTicket(
	guild: Guild,
	config: TicketConfig,
	user: User,
	categoryKey = "general",
): Promise<CreateResult> {
	const prisma = getPrisma();
	const existing = await prisma.ticket.findFirst({
		where: { guildId: guild.id, userId: user.id, open: true },
	});
	if (existing) return { ok: false, messageKey: "tickets:error.alreadyOpen" };

	// Older configurations may contain a text channel ID (the command used to
	// accept every channel type), or a category that has since been deleted.
	if (config.categoryId) {
		const parent = await guild.channels.fetch(config.categoryId).catch((err: unknown) => {
			log.warn(
				{ err, guild: guild.id, categoryId: config.categoryId },
				"ticket category lookup failed",
			);
			return null;
		});
		if (!parent || parent.type !== ChannelType.GuildCategory) {
			return { ok: false, messageKey: "tickets:error.categoryUnavailable" };
		}
	}

	const spec = resolveCategory(parseCategories(config.categories), categoryKey);
	const number = await nextNumber(guild.id);
	const me = guild.members.me;
	try {
		const channel = await guild.channels.create({
			name: ticketChannelName(user.username, number, "NORMAL"),
			type: ChannelType.GuildText,
			parent: config.categoryId ?? null,
			permissionOverwrites: [
				{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
				{
					id: user.id,
					allow: [
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.ReadMessageHistory,
					],
				},
				...config.supportRoleIds
					.filter((roleId) => guild.roles.cache.has(roleId))
					.map((roleId) => ({
						id: roleId,
						allow: [
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.SendMessages,
							PermissionFlagsBits.ReadMessageHistory,
						],
					})),
				...(me
					? [
							{
								id: me.id,
								allow: [
									PermissionFlagsBits.ViewChannel,
									PermissionFlagsBits.SendMessages,
									PermissionFlagsBits.ManageChannels,
								],
							},
						]
					: []),
			],
		});
		await prisma.ticket.create({
			data: {
				guildId: guild.id,
				channelId: channel.id,
				userId: user.id,
				number,
				category: spec.key,
				slaMinutes: spec.slaMinutes,
			},
		});
		markTicketChannel(channel.id);
		return { ok: true, channel, number, category: spec };
	} catch (err) {
		log.error({ err, guild: guild.id }, "failed to create ticket channel");
		return { ok: false, messageKey: "tickets:error.createFailed" };
	}
}

export async function claimTicket(channelId: string, moderatorId: string): Promise<boolean> {
	const claimed = await getPrisma().ticket.updateMany({
		where: { channelId, open: true, claimedBy: null },
		data: { claimedBy: moderatorId, status: "CLAIMED" },
	});
	return claimed.count === 1;
}

/** Replace any trailing priority suffix on a channel name with the new one. */
function applyPrioritySuffix(name: string, priority: TicketPriority): string {
	return `${name.replace(/-(?:l|h|u)$/, "")}${PRIORITY_SUFFIX[priority]}`.slice(0, 95);
}

/** Set a ticket's priority and reflect it in the channel name. */
export async function setTicketPriority(
	channel: TextChannel,
	priority: TicketPriority,
): Promise<boolean> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket?.open) return false;
	await getPrisma().ticket.update({ where: { channelId: channel.id }, data: { priority } });
	await channel.setName(applyPrioritySuffix(channel.name, priority)).catch(() => {});
	return true;
}

/** Bump a ticket one priority level, mark it escalated, and rename the channel. */
export async function escalateTicket(channel: TextChannel): Promise<TicketPriority | null> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket?.open) return null;
	const next = escalatePriority((ticket.priority as TicketPriority) ?? "NORMAL");
	await getPrisma().ticket.update({
		where: { channelId: channel.id },
		data: { priority: next, status: "ESCALATED", escalatedAt: new Date() },
	});
	await channel.setName(applyPrioritySuffix(channel.name, next)).catch(() => {});
	return next;
}

/** The ticket row for a channel, or null. */
export async function getTicket(channelId: string) {
	return getPrisma().ticket.findUnique({ where: { channelId } });
}

/** A staff member's ticket throughput in a guild. */
export async function getStaffStats(
	guildId: string,
	userId: string,
): Promise<{ claimed: number; closed: number; openAssigned: number }> {
	const prisma = getPrisma();
	const [claimed, closed, openAssigned] = await Promise.all([
		prisma.ticket.count({ where: { guildId, claimedBy: userId } }),
		prisma.ticket.count({ where: { guildId, closedBy: userId, userId: { not: userId } } }),
		prisma.ticket.count({ where: { guildId, claimedBy: userId, open: true } }),
	]);
	return { claimed, closed, openAssigned };
}

/** Top staff by tickets closed in a guild. */
export async function getStaffLeaderboard(
	guildId: string,
	limit = 10,
): Promise<{ id: string; closed: number }[]> {
	const closed = await getPrisma()
		.ticket.groupBy({
			by: ["closedBy", "userId"],
			where: { guildId, closedBy: { not: null } },
			_count: { _all: true },
		})
		.catch(() => []);
	const counts = new Map<string, number>();
	for (const ticket of closed) {
		const id = ticket.closedBy;
		if (!id || !/^\d{17,20}$/.test(id) || id === ticket.userId) continue;
		counts.set(id, (counts.get(id) ?? 0) + ticket._count._all);
	}
	return [...counts.entries()]
		.map(([id, count]) => ({ id, closed: count }))
		.sort((a, b) => b.closed - a.closed)
		.slice(0, limit);
}

export interface Dashboard {
	total: number;
	unassigned: number;
	slaBreached: number;
	byPriority: Record<string, number>;
	byStatus: Record<string, number>;
	byCategory: Record<string, number>;
	byAssignee: { id: string; count: number }[];
}

/** Aggregate a guild's open tickets for the live dashboard. */
export async function getDashboard(guildId: string): Promise<Dashboard> {
	const open = await getPrisma()
		.ticket.findMany({
			where: { guildId, open: true },
			take: 1000,
			select: { priority: true, status: true, category: true, claimedBy: true, slaBreached: true },
		})
		.catch(() => []);
	const byPriority: Record<string, number> = {};
	const byStatus: Record<string, number> = {};
	const byCategory: Record<string, number> = {};
	const assignees = new Map<string, number>();
	let unassigned = 0;
	let slaBreached = 0;
	for (const ticket of open) {
		byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
		byStatus[ticket.status] = (byStatus[ticket.status] ?? 0) + 1;
		byCategory[ticket.category] = (byCategory[ticket.category] ?? 0) + 1;
		if (ticket.claimedBy)
			assignees.set(ticket.claimedBy, (assignees.get(ticket.claimedBy) ?? 0) + 1);
		else unassigned++;
		if (ticket.slaBreached) slaBreached++;
	}
	const byAssignee = [...assignees.entries()]
		.map(([id, count]) => ({ id, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);
	return {
		total: open.length,
		unassigned,
		slaBreached,
		byPriority,
		byStatus,
		byCategory,
		byAssignee,
	};
}

/** Scheduler handler: delete an archived ticket channel once its reopen window expires - unless it was reopened. */
export async function archiveDeleteTask(payload: unknown, client: Client): Promise<void> {
	const { channelId, closedAt } = (payload ?? {}) as { channelId?: string; closedAt?: number };
	if (!channelId) return;
	await withTicketLock(channelId, async () => {
		const ticket = await getPrisma()
			.ticket.findUnique({ where: { channelId } })
			.catch(() => null);
		if (!canDeleteArchivedTicket(ticket, closedAt)) return;
		const guild = client.guilds.cache.get(ticket.guildId);
		if (!guild) throw new Error(`Guild ${ticket.guildId} unavailable for archive delete`);
		const channel = await guild.channels.fetch(channelId).catch((err: unknown) => {
			if ((err as { code?: number }).code === 10003) return null; // already deleted
			throw err; // transient Discord failure: scheduler retries cleanup
		});
		if (channel)
			await channel.delete("Ticket reopen window expired").catch((err: unknown) => {
				if ((err as { code?: number }).code !== 10003) throw err;
			});
	});
}

export function canDeleteArchivedTicket(
	ticket: { open: boolean; closedAt: Date | null } | null,
	closedAt?: number,
	now = Date.now(),
): ticket is { open: false; closedAt: Date } {
	return (
		!!ticket &&
		!ticket.open &&
		!!ticket.closedAt &&
		(closedAt === undefined || ticket.closedAt.getTime() === closedAt) &&
		ticket.closedAt.getTime() + REOPEN_WINDOW_MS <= now
	);
}

/** Reopen a closed-but-not-yet-deleted ticket: unlock the opener, restore the name, mark open. */
export async function reopenTicket(guild: Guild, number: number): Promise<string | null> {
	const prisma = getPrisma();
	const ticket = await prisma.ticket
		.findUnique({ where: { guildId_number: { guildId: guild.id, number } } })
		.catch(() => null);
	if (!ticket) return null;
	return withTicketLock(ticket.channelId, async () => {
		const current = await prisma.ticket.findUnique({ where: { channelId: ticket.channelId } });
		if (
			!current ||
			current.open ||
			!current.closedAt ||
			current.closedAt.getTime() + REOPEN_WINDOW_MS <= Date.now()
		)
			return null;
		const channel = await guild.channels.fetch(current.channelId).catch(() => null);
		if (!channel || !("permissionOverwrites" in channel) || !("setName" in channel)) return null;
		await channel.permissionOverwrites.edit(current.userId, {
			SendMessages: true,
			ViewChannel: true,
		});
		const reopened = await prisma.ticket
			.updateMany({
				where: { channelId: current.channelId, open: false, closedAt: current.closedAt },
				data: {
					open: true,
					status: "OPEN",
					closedAt: null,
					closedBy: null,
					closeReason: null,
					slaBreached: false,
				},
			})
			.catch(async (err: unknown) => {
				await channel.permissionOverwrites
					.edit(current.userId, { SendMessages: false })
					.catch(() => {});
				throw err;
			});
		if (reopened.count !== 1) {
			await channel.permissionOverwrites
				.edit(current.userId, { SendMessages: false })
				.catch(() => {});
			return null;
		}
		await channel.setName(channel.name.replace(/-closed$/, "")).catch(() => {});
		markTicketChannel(current.channelId);
		return current.channelId;
	});
}

/** Add or remove the caller as a watcher on an open ticket. Returns the new count, or null. */
export async function watchTicket(
	channelId: string,
	userId: string,
	add: boolean,
): Promise<number | null> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId } });
	if (!ticket?.open) return null;
	const next = add
		? [...new Set([...ticket.watchers, userId])]
		: ticket.watchers.filter((x) => x !== userId);
	await getPrisma().ticket.update({ where: { channelId }, data: { watchers: next } });
	return next.length;
}

/** DM every watcher of a ticket a short update. Best-effort. */
export async function notifyWatchers(channel: TextChannel, message: string): Promise<void> {
	const ticket = await getPrisma()
		.ticket.findUnique({ where: { channelId: channel.id }, select: { watchers: true } })
		.catch(() => null);
	if (!ticket?.watchers.length) return;
	for (const id of ticket.watchers) {
		const user = await channel.client.users.fetch(id).catch(() => null);
		await user?.send(message).catch(() => {});
	}
}

/** Add or remove a tag on an open ticket. Returns the new tag list, or null. */
export async function tagTicket(
	channelId: string,
	tag: string,
	add: boolean,
): Promise<string[] | null> {
	const prisma = getPrisma();
	const ticket = await prisma.ticket.findUnique({ where: { channelId } });
	if (!ticket?.open) return null;
	const clean = tag.toLowerCase().trim().slice(0, 30);
	if (!clean) return ticket.tags;
	const next = add ? [...new Set([...ticket.tags, clean])] : ticket.tags.filter((x) => x !== clean);
	await prisma.ticket.update({ where: { channelId }, data: { tags: next } });
	return next;
}

/** Move a ticket to a different queue (category), adopting that queue's SLA. */
export async function transferTicket(
	channel: TextChannel,
	categoryKey: string,
): Promise<CategorySpec | null> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket?.open) return null;
	const cats = parseCategories((await getConfig(channel.guild.id))?.categories);
	const spec = cats.find((c) => c.key === categoryKey);
	if (!spec) return null;
	await getPrisma().ticket.update({
		where: { channelId: channel.id },
		data: { category: spec.key, slaMinutes: spec.slaMinutes },
	});
	return spec;
}

export interface CloseInfo {
	closedAt: Date;
	number: number;
	userId: string;
	category: string;
	priority: string;
	durationMins: number;
	firstResponseMins: number | null;
	messageCount: number;
	transcript: string;
}

export async function closeTicket(
	channel: TextChannel,
	closedBy: string,
	reason?: string,
	closedAt = new Date(),
): Promise<CloseInfo | null> {
	const prisma = getPrisma();
	const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket?.open) return null;
	const now = closedAt;
	const durationMins = Math.floor((now.getTime() - ticket.createdAt.getTime()) / 60_000);
	const firstResponseMins = ticket.firstResponseAt
		? Math.floor((ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60_000)
		: null;
	const messageCount = await prisma.ticketMessage
		.count({ where: { channelId: channel.id } })
		.catch(() => 0);
	const transcript = await buildTranscript(channel.id, ticket, now);
	const closed = await prisma.ticket.updateMany({
		where: { channelId: channel.id, open: true },
		data: {
			open: false,
			status: "CLOSED",
			closedAt: now,
			closedBy,
			closeReason: reason ?? null,
			summary: `Closed by ${closedBy} after ${durationMins}m, ${messageCount} messages`,
		},
	});
	if (closed.count === 0) return null;
	unmarkTicketChannel(channel.id);
	return {
		closedAt: now,
		number: ticket.number,
		userId: ticket.userId,
		category: ticket.category,
		priority: ticket.priority,
		durationMins,
		firstResponseMins,
		messageCount,
		transcript,
	};
}
