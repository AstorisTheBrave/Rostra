import { getRedis } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";

export interface ProfileStats {
	level: number;
	xp: number;
	levelRank: number | null;
	netWorth: number;
	ecoRank: number | null;
}

/**
 * Gather a member's leveling + economy stats for their profile card. Reads the
 * shared `LevelUser`/`EconomyUser` tables and the Redis leaderboard sorted sets
 * directly (read-only, no module import). Everything degrades to 0/null when the
 * row or Redis is absent.
 */
export async function getProfileStats(guildId: string, userId: string): Promise<ProfileStats> {
	const prisma = getPrisma();
	const [level, eco] = await Promise.all([
		prisma.levelUser.findUnique({ where: { guildId_userId: { guildId, userId } } }),
		prisma.economyUser.findUnique({ where: { guildId_userId: { guildId, userId } } }),
	]);

	let levelRank: number | null = null;
	let ecoRank: number | null = null;
	const redis = getRedis();
	if (redis) {
		const lr = await redis.zrevrank(`lb:level:${guildId}`, userId).catch(() => null);
		levelRank = lr === null || lr === undefined ? null : lr + 1;
		const er = await redis.zrevrank(`lb:eco:${guildId}`, userId).catch(() => null);
		ecoRank = er === null || er === undefined ? null : er + 1;
	}

	return {
		level: level?.level ?? 0,
		xp: level?.xp ?? 0,
		levelRank,
		netWorth: (eco?.wallet ?? 0) + (eco?.bank ?? 0),
		ecoRank,
	};
}

/** Compact a number for display: 1500 -> "1.5k", 2_300_000 -> "2.3M". */
export function compactNumber(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
	return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
}

/** The stat strip line for the card, e.g. "Level 12  ·  Rank #3  ·  4.2k coins". */
export function statLine(stats: ProfileStats): string {
	const parts = [`Level ${stats.level}`];
	if (stats.levelRank !== null) parts.push(`Rank #${stats.levelRank}`);
	parts.push(`${compactNumber(stats.netWorth)} coins`);
	return parts.join("  ·  ");
}
