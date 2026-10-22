import type { BotClient } from "@/client/BotClient.ts";

export interface BotStats {
	servers: number;
	users: number;
	channels: number;
	shardCount: number;
	currentShard: number;
	wsPing: number;
	uptimeSec: number;
	memoryBytes: number;
	commands: number;
}

export interface ShardStat {
	id: number;
	ping: number;
	servers: number;
	users: number;
	memoryBytes: number;
	uptimeSec: number;
}

/** Aggregate stats across all shards (falls back to the local client when unsharded). */
export async function gatherBotStats(client: BotClient): Promise<BotStats> {
	const commands = client.commands.size;
	const wsPing = Math.max(0, Math.round(client.ws.ping));
	const uptimeSec = Math.round(process.uptime());

	if (client.shard) {
		const per = await client.shard.broadcastEval((c) => ({
			servers: c.guilds.cache.size,
			users: c.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
			channels: c.channels.cache.size,
			memory: process.memoryUsage().rss,
		}));
		const sum = (pick: (s: (typeof per)[number]) => number) => per.reduce((a, s) => a + pick(s), 0);
		return {
			servers: sum((s) => s.servers),
			users: sum((s) => s.users),
			channels: sum((s) => s.channels),
			shardCount: client.shard.count,
			currentShard: client.shard.ids[0] ?? 0,
			wsPing,
			uptimeSec,
			memoryBytes: sum((s) => s.memory),
			commands,
		};
	}

	return {
		servers: client.guilds.cache.size,
		users: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
		channels: client.channels.cache.size,
		shardCount: 1,
		currentShard: 0,
		wsPing,
		uptimeSec,
		memoryBytes: process.memoryUsage().rss,
		commands,
	};
}

/** Per-shard stats, sorted by shard id. */
export async function gatherShardStats(client: BotClient): Promise<ShardStat[]> {
	if (client.shard) {
		const per = await client.shard.broadcastEval((c) => ({
			id: c.shard?.ids[0] ?? 0,
			ping: Math.max(0, Math.round(c.ws.ping)),
			servers: c.guilds.cache.size,
			users: c.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
			memory: process.memoryUsage().rss,
			uptime: Math.round(process.uptime()),
		}));
		return per
			.map((s) => ({
				id: s.id,
				ping: s.ping,
				servers: s.servers,
				users: s.users,
				memoryBytes: s.memory,
				uptimeSec: s.uptime,
			}))
			.sort((a, b) => a.id - b.id);
	}

	return [
		{
			id: 0,
			ping: Math.max(0, Math.round(client.ws.ping)),
			servers: client.guilds.cache.size,
			users: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
			memoryBytes: process.memoryUsage().rss,
			uptimeSec: Math.round(process.uptime()),
		},
	];
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatUptime(seconds: number): string {
	const d = Math.floor(seconds / 86_400);
	const h = Math.floor((seconds % 86_400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const parts: string[] = [];
	if (d) parts.push(`${d}d`);
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	parts.push(`${s}s`);
	return parts.join(" ");
}
