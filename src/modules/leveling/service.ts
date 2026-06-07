import type { LevelConfig, LevelUser } from "@prisma/client";
import { getRedis } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("leveling");

const configCache = new Map<string, LevelConfig | null>();

/** Total XP required to reach a given level: 50 * level * (level + 1). */
export function totalXpForLevel(level: number): number {
	return 50 * level * (level + 1);
}

/** The level reached with a given total XP. */
export function levelFromXp(xp: number): number {
	let level = 0;
	while (totalXpForLevel(level + 1) <= xp) level++;
	return level;
}

/** XP into the current level and XP needed for the next, for progress display. */
export function levelProgress(xp: number): { level: number; into: number; needed: number } {
	const level = levelFromXp(xp);
	const base = totalXpForLevel(level);
	const next = totalXpForLevel(level + 1);
	return { level, into: xp - base, needed: next - base };
}

export async function getConfig(guildId: string): Promise<LevelConfig | null> {
	const cached = configCache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.levelConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load level config");
			return null;
		});
	configCache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<LevelConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<LevelConfig> {
	const cfg = await getPrisma().levelConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	configCache.set(guildId, cfg);
	return cfg;
}

export function invalidate(guildId: string): void {
	configCache.delete(guildId);
}

export async function getUser(guildId: string, userId: string): Promise<LevelUser> {
	return getPrisma().levelUser.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId },
		update: {},
	});
}

export interface XpResult {
	leveledUp: boolean;
	level: number;
	xp: number;
}

/** Add XP, recompute level, sync the leaderboard, and report if the member levelled up. */
export async function addXp(guildId: string, userId: string, amount: number): Promise<XpResult> {
	const current = await getUser(guildId, userId);
	const xp = current.xp + amount;
	const level = levelFromXp(xp);
	await getPrisma().levelUser.update({
		where: { guildId_userId: { guildId, userId } },
		data: { xp, level },
	});
	const redis = getRedis();
	if (redis) await redis.zadd(`lb:level:${guildId}`, xp, userId).catch(() => {});
	return { leveledUp: level > current.level, level, xp };
}

export async function setLevel(guildId: string, userId: string, level: number): Promise<void> {
	const xp = totalXpForLevel(level);
	await getPrisma().levelUser.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId, xp, level },
		update: { xp, level },
	});
	const redis = getRedis();
	if (redis) await redis.zadd(`lb:level:${guildId}`, xp, userId).catch(() => {});
}

export async function getRewards(guildId: string): Promise<{ level: number; roleId: string }[]> {
	return getPrisma().levelReward.findMany({ where: { guildId }, orderBy: { level: "asc" } });
}

export async function setReward(guildId: string, level: number, roleId: string): Promise<void> {
	await getPrisma().levelReward.upsert({
		where: { guildId_level: { guildId, level } },
		create: { guildId, level, roleId },
		update: { roleId },
	});
}

export async function removeReward(guildId: string, level: number): Promise<boolean> {
	const existing = await getPrisma().levelReward.findUnique({
		where: { guildId_level: { guildId, level } },
	});
	if (!existing) return false;
	await getPrisma().levelReward.delete({ where: { guildId_level: { guildId, level } } });
	return true;
}

export interface LevelEntry {
	userId: string;
	xp: number;
	level: number;
}

/** 1-based leaderboard position for a user (Redis ZREVRANK, Prisma count fallback). */
export async function rankPosition(guildId: string, userId: string): Promise<number> {
	const redis = getRedis();
	if (redis) {
		const rank = await redis.zrevrank(`lb:level:${guildId}`, userId).catch(() => null);
		if (rank !== null && rank !== undefined) return rank + 1;
	}
	const me = await getPrisma().levelUser.findUnique({
		where: { guildId_userId: { guildId, userId } },
	});
	if (!me) return 0;
	const ahead = await getPrisma().levelUser.count({
		where: { guildId, xp: { gt: me.xp } },
	});
	return ahead + 1;
}

export async function leaderboard(guildId: string, limit = 10): Promise<LevelEntry[]> {
	const redis = getRedis();
	if (redis) {
		const rows = await redis
			.zrevrange(`lb:level:${guildId}`, 0, limit - 1, "WITHSCORES")
			.catch(() => [] as string[]);
		if (rows.length) {
			const entries: LevelEntry[] = [];
			for (let i = 0; i < rows.length; i += 2) {
				const xp = Number(rows[i + 1] ?? 0);
				entries.push({ userId: rows[i] ?? "", xp, level: levelFromXp(xp) });
			}
			return entries;
		}
	}
	const users = await getPrisma().levelUser.findMany({
		where: { guildId },
		orderBy: { xp: "desc" },
		take: limit,
	});
	return users.map((u) => ({ userId: u.userId, xp: u.xp, level: u.level }));
}
