import type { TicketConfig } from "@prisma/client";
import {
	ChannelType,
	type Guild,
	type GuildMember,
	PermissionFlagsBits,
	type TextChannel,
	type User,
} from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

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
		create: { guildId, ...data },
		update: data,
	});
	cache.set(guildId, cfg);
	return cfg;
}

export function invalidate(guildId: string): void {
	cache.delete(guildId);
}

// Hot-path cache so the global messageCreate listener does not hit the DB for every
// message: known ticket channels are recorded; everything else is remembered as a
// non-ticket after one lookup so normal channels are queried at most once.
const ticketChannels = new Set<string>();
const notTicketChannels = new Set<string>();

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
	await prisma.ticketMessage
		.create({
			data: {
				channelId: input.channelId,
				guildId: input.guildId,
				authorId: input.authorId,
				authorTag: input.authorTag,
				content: input.content.slice(0, 1900),
			},
		})
		.catch(() => {});
	const firstResponse = ticket.userId !== input.authorId && !ticket.firstResponseAt;
	await prisma.ticket
		.update({
			where: { channelId: input.channelId },
			data: {
				lastActivityAt: new Date(),
				...(firstResponse ? { firstResponseAt: new Date() } : {}),
			},
		})
		.catch(() => {});
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
	| { ok: true; channel: TextChannel; number: number }
	| { ok: false; messageKey: string };

export async function createTicket(
	guild: Guild,
	config: TicketConfig,
	user: User,
): Promise<CreateResult> {
	const prisma = getPrisma();
	const existing = await prisma.ticket.findFirst({
		where: { guildId: guild.id, userId: user.id, open: true },
	});
	if (existing) return { ok: false, messageKey: "tickets:error.alreadyOpen" };

	const number = await nextNumber(guild.id);
	const me = guild.members.me;
	try {
		const channel = await guild.channels.create({
			name: `ticket-${number}`,
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
				...config.supportRoleIds.map((roleId) => ({
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
			data: { guildId: guild.id, channelId: channel.id, userId: user.id, number },
		});
		markTicketChannel(channel.id);
		return { ok: true, channel, number };
	} catch (err) {
		log.error({ err, guild: guild.id }, "failed to create ticket channel");
		return { ok: false, messageKey: "tickets:error.createFailed" };
	}
}

export async function claimTicket(channelId: string, moderatorId: string): Promise<boolean> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId } });
	if (!ticket?.open) return false;
	await getPrisma().ticket.update({
		where: { channelId },
		data: { claimedBy: moderatorId, status: "CLAIMED" },
	});
	return true;
}

export interface CloseInfo {
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
): Promise<CloseInfo | null> {
	const prisma = getPrisma();
	const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket) return null;
	const now = new Date();
	const durationMins = Math.floor((now.getTime() - ticket.createdAt.getTime()) / 60_000);
	const firstResponseMins = ticket.firstResponseAt
		? Math.floor((ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60_000)
		: null;
	const messageCount = await prisma.ticketMessage
		.count({ where: { channelId: channel.id } })
		.catch(() => 0);
	const transcript = await buildTranscript(channel.id, ticket, now);
	await prisma.ticket.update({
		where: { channelId: channel.id },
		data: {
			open: false,
			status: "CLOSED",
			closedAt: now,
			closedBy,
			closeReason: reason ?? null,
			summary: `Closed by ${closedBy} after ${durationMins}m, ${messageCount} messages`,
		},
	});
	unmarkTicketChannel(channel.id);
	return {
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
