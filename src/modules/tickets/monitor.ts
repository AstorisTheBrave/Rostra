import { REST, Routes } from "discord.js";
import { config } from "@/config.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

// Manager-side ticket monitor. Runs in the cluster manager cron (no gateway client),
// so it talks to Discord over REST like the feeds/serverstats pollers. It flags open
// tickets that have blown their SLA and posts a plain-text alert to the ticket log
// channel. Channel-level actions (escalate/close) stay on the shards.

const log = getLogger("tickets");

let rest: REST | undefined;
function getRest(): REST {
	if (!rest) rest = new REST().setToken(config.discord.token);
	return rest;
}

/** Flag SLA-breached open tickets and alert their guild's ticket log channel once. */
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
		const ageMin = Math.floor((now - ticket.createdAt.getTime()) / 60_000);
		if (ageMin <= ticket.slaMinutes) continue;

		await prisma.ticket
			.update({ where: { channelId: ticket.channelId }, data: { slaBreached: true } })
			.catch(() => {});

		const cfg = await prisma.ticketConfig
			.findUnique({ where: { guildId: ticket.guildId } })
			.catch(() => null);
		if (!cfg?.logChannelId) continue;

		const content = `⏰ **SLA breach** - ticket #${ticket.number} (<#${ticket.channelId}>) has been open ${ageMin}m, past its ${ticket.slaMinutes}m SLA.`;
		await getRest()
			.post(Routes.channelMessages(cfg.logChannelId), { body: { content } })
			.catch((err) => log.error({ err, guild: ticket.guildId }, "sla alert post failed"));
	}
}
