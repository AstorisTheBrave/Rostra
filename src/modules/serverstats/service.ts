import type { StatsChannel } from "@prisma/client";
import { REST, Routes } from "discord.js";
import { config } from "@/config.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("serverstats");

/** Counter kinds a stats channel can display. */
export const STAT_TYPES = ["members", "online", "boosts", "channels", "roles"] as const;
export type StatType = (typeof STAT_TYPES)[number];

export function isStatType(value: string): value is StatType {
	return (STAT_TYPES as readonly string[]).includes(value);
}

/** Default `{count}` template per stat type. */
export function defaultTemplate(type: StatType): string {
	switch (type) {
		case "members":
			return "Members: {count}";
		case "online":
			return "Online: {count}";
		case "boosts":
			return "Boosts: {count}";
		case "channels":
			return "Channels: {count}";
		default:
			return "Roles: {count}";
	}
}

/** Render a channel name from its template and the live count. */
export function applyTemplate(template: string, count: number): string {
	const name = template.replaceAll("{count}", count.toLocaleString("en-US"));
	return name.length > 100 ? name.slice(0, 100) : name;
}

// ── DB ───────────────────────────────────────────────────────────────────────

export async function addStat(
	guildId: string,
	channelId: string,
	type: StatType,
	template: string,
): Promise<StatsChannel> {
	return getPrisma().statsChannel.upsert({
		where: { channelId },
		create: { channelId, guildId, type, template },
		update: { type, template },
	});
}

export async function removeStat(guildId: string, channelId: string): Promise<boolean> {
	const res = await getPrisma().statsChannel.deleteMany({ where: { channelId, guildId } });
	return res.count > 0;
}

export async function listStats(guildId: string): Promise<StatsChannel[]> {
	return getPrisma().statsChannel.findMany({ where: { guildId } });
}

async function allStats(): Promise<StatsChannel[]> {
	return getPrisma().statsChannel.findMany();
}

// ── Polling (manager cron; REST only, no gateway client) ──────────────────────

let rest: REST | undefined;
function getRest(): REST {
	if (!rest) rest = new REST().setToken(config.discord.token);
	return rest;
}

interface GuildCounts {
	members: number;
	online: number;
	boosts: number;
	channels: number;
	roles: number;
}

async function fetchGuildCounts(guildId: string): Promise<GuildCounts | null> {
	try {
		const guild = (await getRest().get(Routes.guild(guildId), {
			query: new URLSearchParams({ with_counts: "true" }),
		})) as {
			approximate_member_count?: number;
			approximate_presence_count?: number;
			premium_subscription_count?: number;
		};
		const channels = (await getRest().get(Routes.guildChannels(guildId))) as unknown[];
		const roles = (await getRest().get(Routes.guildRoles(guildId))) as unknown[];
		return {
			members: guild.approximate_member_count ?? 0,
			online: guild.approximate_presence_count ?? 0,
			boosts: guild.premium_subscription_count ?? 0,
			channels: Array.isArray(channels) ? channels.length : 0,
			roles: Array.isArray(roles) ? roles.length : 0,
		};
	} catch (err) {
		log.debug({ err, guildId }, "stats guild fetch failed");
		return null;
	}
}

/** Rename every stats channel to its live count. Grouped per guild to share fetches. */
export async function pollStatsChannels(): Promise<void> {
	const rows = await allStats();
	if (rows.length === 0) return;
	const byGuild = new Map<string, StatsChannel[]>();
	for (const row of rows) {
		const list = byGuild.get(row.guildId) ?? [];
		list.push(row);
		byGuild.set(row.guildId, list);
	}

	for (const [guildId, channels] of byGuild) {
		const counts = await fetchGuildCounts(guildId);
		if (!counts) continue;
		for (const row of channels) {
			if (!isStatType(row.type)) continue;
			const name = applyTemplate(row.template, counts[row.type]);
			await getRest()
				.patch(Routes.channel(row.channelId), { body: { name } })
				.catch((err) => log.debug({ err, channelId: row.channelId }, "stats rename failed"));
		}
	}
}
