import { fileURLToPath } from "node:url";
import { ClusterManager } from "discord-hybrid-sharding";
import { config } from "@/config.ts";
import { registerBuiltinCron } from "@/jobs/builtins.ts";
import { syncCommands } from "@/services/commandSync.ts";
import { startCron } from "@/services/cron.ts";
import { startWhenLeader } from "@/services/leader.ts";
import { getLogger } from "@/services/logger.ts";
import { startAutopost } from "@/web/autopost.ts";
import { type ShardStat, startWebServer } from "@/web/server.ts";

/**
 * Hybrid cluster manager (discord-hybrid-sharding). Spawns N cluster processes,
 * each running a contiguous range of shards, so the fleet scales past a single
 * host. Only used when `SHARDING_MODE=hybrid`; the native ShardingManager
 * (`cluster.ts`) remains the default. Shards still route each guild to one shard,
 * so per-guild state stays single-owner; cross-cluster coordination (modmail
 * relay, i18n reload, feature flags) goes through the Redis control bus, and the
 * single-instance crons run on one cluster via leader election.
 */

const log = getLogger("cluster:hybrid");
const botPath = fileURLToPath(new URL("../bot.ts", import.meta.url));

export async function runHybridManager(): Promise<void> {
	const manager = new ClusterManager(botPath, {
		token: config.discord.token,
		totalShards: config.sharding.count ?? "auto",
		...(config.sharding.shardsPerCluster
			? { shardsPerClusters: config.sharding.shardsPerCluster }
			: {}),
		mode: "process",
		respawn: true,
		// Cluster processes run the TypeScript entry directly via tsx.
		execArgv: ["--import", "tsx"],
	});

	manager.on("clusterCreate", (cluster) => {
		log.info({ cluster: cluster.id }, "cluster spawned");
	});

	// One broadcastEval result per cluster (each cluster's main client). We report
	// per-cluster guild counts on the status page.
	const shardStats = async (): Promise<ShardStat[]> => {
		const perCluster = await manager.broadcastEval((c) => ({
			guilds: c.guilds.cache.size,
			ping: c.ws.ping,
		}));
		return perCluster.map((s, i) => ({ id: i, guilds: s.guilds, ping: Math.round(s.ping) }));
	};

	const totalGuilds = async (): Promise<number> => {
		const counts = await manager.broadcastEval((c) => c.guilds.cache.size);
		return counts.reduce((sum, n) => sum + n, 0);
	};

	await syncCommands().catch((err) => log.error({ err }, "command sync failed (continuing)"));
	await startWebServer({ shardStats });
	startAutopost(async () => ({
		serverCount: await totalGuilds(),
		shardCount: typeof manager.totalShards === "number" ? manager.totalShards : 1,
	}));

	await manager.spawn({ timeout: -1 });

	// Single-instance jobs run on exactly one cluster manager fleet-wide.
	await startWhenLeader("manager-crons", () => {
		registerBuiltinCron();
		startCron();
	});
	log.info("all clusters spawned");
}
