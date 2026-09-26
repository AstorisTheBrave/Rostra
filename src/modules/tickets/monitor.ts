import { REST, Routes } from "discord.js";
import { config } from "@/config.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

// Manager-side ticket monitor. Runs in the cluster manager cron (no gateway client),
// so it talks to Discord over REST like the feeds/serverstats pollers. It flags open
// tickets that have blown their first-response SLA and posts a plain-text alert to
// the ticket log channel. Channel-level actions (escalate/close) stay on the shards.

const log = getLogger("tickets");

let rest: REST | undefined;
function getRest(): REST {
	if (!rest) rest = new REST().setToken(config.discord.token);
	return rest;
}

/** A first response after the exact deadline breaches, even if the minute display rounds down. */
export function isFirstResponseBreached(
	createdAt: Date,
	firstResponseAt: Date | null,
	slaMinutes: number,
	now: number,
): boolean {
	return (firstResponseAt?.getTime() ?? now) - createdAt.getTime() > slaMinutes * 60_000;
}

/** Flag first-response SLA breaches on open tickets and alert the guild log once. */
export async function sweepTicketSla(): Promise<void> {
	const prisma = getPrisma();
	const now = Date.now();
	let cursor: string | undefined;
	for (;;) {
		const open = await prisma.ticket
			.findMany({
				where: { open: true, slaBreached: false, ...(cursor ? { channelId: { gt: cursor } } : {}) },
				orderBy: { channelId: "asc" },
				take: 500,
			})
			.catch((err) => {
				log.error({ err }, "ticket sla sweep query failed");
				return [];
			});
		if (open.length === 0) break;
		for (const ticket of open) {
			// SLA is specifically time-to-first-response. Once a response exists, compare
			// that timestamp with the ticket's opening time; otherwise compare "now".
			// This prevents long-running but promptly answered tickets from being marked
			// as breached simply because they remain open beyond the SLA window.
			const responseAt = ticket.firstResponseAt?.getTime() ?? now;
			const responseMins = Math.floor((responseAt - ticket.createdAt.getTime()) / 60_000);
			if (
				!isFirstResponseBreached(ticket.createdAt, ticket.firstResponseAt, ticket.slaMinutes, now)
			)
				continue;

			const updated = await prisma.ticket
				.updateMany({
					where: { channelId: ticket.channelId, open: true, slaBreached: false },
					data: { slaBreached: true },
				})
				.catch((err) => {
					log.error({ err, channelId: ticket.channelId }, "failed to flag ticket sla breach");
					return { count: 0 };
				});
			if (updated.count !== 1) continue;

			const cfg = await prisma.ticketConfig
				.findUnique({ where: { guildId: ticket.guildId } })
				.catch(() => null);
			if (!cfg?.logChannelId) continue;

			const detail = ticket.firstResponseAt
				? `first response took ${responseMins}m`
				: `has waited ${responseMins}m for a first response`;
			const content = `⏰ **SLA breach** - ticket #${ticket.number} (<#${ticket.channelId}>) ${detail}, past its ${ticket.slaMinutes}m first-response SLA.`;
			await getRest()
				.post(Routes.channelMessages(cfg.logChannelId), { body: { content } })
				.catch((err) => log.error({ err, guild: ticket.guildId }, "sla alert post failed"));
		}
		if (open.length < 500) break;
		cursor = open[open.length - 1]?.channelId;
	}
}
