import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import { Api } from "@top-gg/sdk";

const log = getLogger("autopost");

const INTERVAL_MS = 30 * 60 * 1000;

export interface BotStats {
	serverCount: number;
	shardCount: number;
}

/**
 * Posts aggregated server count to top.gg from the manager process every 30 minutes.
 * `getStats` must aggregate across shards (counts are partial per shard). No-op without a token.
 */
export function startAutopost(getStats: () => Promise<BotStats>): NodeJS.Timeout | undefined {
	if (!config.topgg.token) {
		log.info("TOPGG_TOKEN unset — stats autoposting disabled");
		return undefined;
	}
	const api = new Api(config.topgg.token);
	const post = async (): Promise<void> => {
		try {
			const stats = await getStats();
			await api.postStats({ serverCount: stats.serverCount, shardCount: stats.shardCount });
			log.info({ servers: stats.serverCount, shards: stats.shardCount }, "posted stats to top.gg");
		} catch (err) {
			log.error({ err }, "postStats failed");
		}
	};
	const timer = setInterval(() => void post(), INTERVAL_MS);
	void post();
	return timer;
}
