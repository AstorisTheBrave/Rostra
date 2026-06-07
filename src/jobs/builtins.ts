import { pollAllFeeds } from "@/modules/feeds/service.ts";
import { pollStatsChannels } from "@/modules/serverstats/service.ts";
import { registerCron } from "@/services/cron.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("cron");
const DAY = 86_400_000;

/**
 * Register the platform's built-in recurring jobs. Call once in the manager
 * before `startCron()`.
 */
export function registerBuiltinCron(): void {
	// Prune scheduled tasks left far in the past (e.g. a guild left before its
	// task could fire), so the table does not grow unbounded.
	registerCron({
		name: "prune-scheduled-tasks",
		everyMs: DAY,
		handler: async () => {
			const cutoff = new Date(Date.now() - 7 * DAY);
			const res = await getPrisma().scheduledTask.deleteMany({ where: { runAt: { lt: cutoff } } });
			if (res.count > 0) log.info({ count: res.count }, "pruned stale scheduled tasks");
		},
	});

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
}
