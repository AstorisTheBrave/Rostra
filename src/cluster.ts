import { fileURLToPath } from "node:url";
import { ShardingManager } from "discord.js";
import { config } from "@/config.ts";
import { registerBuiltinCron } from "@/jobs/builtins.ts";
import { syncCommands } from "@/services/commandSync.ts";
import { startCron } from "@/services/cron.ts";
import { startWhenLeader } from "@/services/leader.ts";
import { getLogger } from "@/services/logger.ts";
import { startAutopost } from "@/web/autopost.ts";
import { type ShardStat, startWebServer } from "@/web/server.ts";

const log = getLogger("cluster");

const botPath = fileURLToPath(new URL("./bot.ts", import.meta.url));

const manager = new ShardingManager(botPath, {
	token: config.discord.token,
	totalShards: config.sharding.count ?? "auto",
	respawn: true,
	mode: "process",
	// Spawned shards run the TypeScript entry directly via tsx.
	execArgv: ["--import", "tsx"],
});

manager.on("shardCreate", (shard) => {
	log.info({ shard: shard.id }, "shard spawned");
	shard.on("death", () => log.error({ shard: shard.id }, "shard died - manager will respawn"));
});

async function shardStats(): Promise<ShardStat[]> {
	const guilds = await manager.broadcastEval((c) => c.guilds.cache.size);
	const pings = await manager.broadcastEval((c) => c.ws.ping);
	return guilds.map((count, i) => ({ id: i, guilds: count, ping: Math.round(pings[i] ?? 0) }));
}

async function totalGuilds(): Promise<number> {
	const counts = await manager.broadcastEval((c) => c.guilds.cache.size);
	return counts.reduce((sum, n) => sum + n, 0);
}

async function main(): Promise<void> {
	// Auto-register slash commands when their definitions changed (hash-gated).
	// Runs once in the manager before shards spawn; failure never blocks boot.
	await syncCommands().catch((err) => log.error({ err }, "command sync failed (continuing)"));
	await startWebServer({ shardStats });
	startAutopost(async () => ({
		serverCount: await totalGuilds(),
		shardCount: typeof manager.totalShards === "number" ? manager.totalShards : 1,
	}));
	await manager.spawn();
	// Single-instance jobs run on exactly one cluster manager fleet-wide (leader
	// election). In native single-manager mode this is a trivial yes.
	await startWhenLeader("manager-crons", () => {
		registerBuiltinCron();
		startCron();
	});
	log.info("all shards spawned");
}

main().catch((err) => {
	log.error({ err }, "cluster boot failed");
	process.exit(1);
});
