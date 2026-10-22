import { pollAllFeeds } from "@/modules/feeds/service.ts";
import { pollStatsChannels } from "@/modules/serverstats/service.ts";
import { sweepTicketSla } from "@/modules/tickets/monitor.ts";
import { registerCron } from "@/services/cron.ts";

/**
 * Register the platform's built-in recurring jobs. Call once in the manager
 * before `startCron()`.
 */
export function registerBuiltinCron(): void {
	// Poll YouTube/Twitch feeds and announce new videos/streams (manager-only, REST).
	registerCron({
		name: "poll-feeds",
		everyMs: 5 * 60_000,
		handler: () => pollAllFeeds(),
	});

	// Rename server-stats voice channels to live counts (manager-only, REST).
	// Channel name edits are limited to ~2 per 10 min, so a 10-min cadence is safe.
	registerCron({
		name: "poll-stats-channels",
		everyMs: 10 * 60_000,
		handler: () => pollStatsChannels(),
	});

	// Flag SLA-breached open tickets and alert their log channel (manager-only, REST).
	registerCron({
		name: "tickets-sla",
		everyMs: 10 * 60_000,
		handler: () => sweepTicketSla(),
	});
}
