import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import type { TicketConfig } from "@prisma/client";
import {
	ChannelType,
	type Guild,
	type GuildMember,
	PermissionFlagsBits,
	type TextChannel,
	type User,
} from "discord.js";

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
		return { ok: true, channel, number };
	} catch (err) {
		log.error({ err, guild: guild.id }, "failed to create ticket channel");
		return { ok: false, messageKey: "tickets:error.createFailed" };
	}
}

export async function claimTicket(channelId: string, moderatorId: string): Promise<boolean> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId } });
	if (!ticket || !ticket.open) return false;
	await getPrisma().ticket.update({ where: { channelId }, data: { claimedBy: moderatorId } });
	return true;
}

export async function closeTicket(
	channel: TextChannel,
): Promise<{ number: number; userId: string } | null> {
	const ticket = await getPrisma().ticket.findUnique({ where: { channelId: channel.id } });
	if (!ticket) return null;
	await getPrisma().ticket.update({ where: { channelId: channel.id }, data: { open: false } });
	return { number: ticket.number, userId: ticket.userId };
}
