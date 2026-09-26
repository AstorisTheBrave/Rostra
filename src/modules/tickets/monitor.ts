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

/** Flag first-response SLA breaches on open tickets and alert the guild log once. */
export async function sweepTicketSla(): Promise<void> {
	const prisma = getPrisma();
	const now = Date.now();
	const open = await prisma.ticket
		.findMany({ where: { open: true, slaBreached: false }, take: 500 })
		.catch((err) => {
			log.error({ err }, "ticket sla sweep query failed");
			return [];
		});

	for (const ticket of open) {
		// SLA is specifically time-to-first-response. Once a response exists, compare
		// that timestamp with the ticket's opening time; otherwise compare "now".
		// This prevents long-running but promptly answered tickets from being marked
		// as breached simply because they remain open beyond the SLA window.
		const responseAt = ticket.firstResponseAt?.getTime() ?? now;
		const responseMins = Math.floor((responseAt - ticket.createdAt.getTime()) / 60_000);
		if (responseMins <= ticket.slaMinutes) continue;

		await prisma.ticket
			.update({ where: { channelId: ticket.channelId }, data: { slaBreached: true } })
			.catch(() => {});

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
}
