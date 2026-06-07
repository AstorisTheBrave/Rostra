import type { RepUser } from "@prisma/client";
import { getRedis } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("reputation");

export const GIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Remaining give-cooldown in ms (0 if ready). */
export function cooldownRemaining(last: Date | null, now = Date.now()): number {
	if (!last) return 0;
	const elapsed = now - last.getTime();
	return elapsed >= GIVE_COOLDOWN_MS ? 0 : GIVE_COOLDOWN_MS - elapsed;
}

export async function getRep(guildId: string, userId: string): Promise<RepUser> {
	return getPrisma().repUser.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId },
		update: {},
	});
}

async function syncLeaderboard(guildId: string, userId: string, points: number): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	await redis.zadd(`lb:rep:${guildId}`, points, userId).catch((err) => {
		log.error({ err }, "rep leaderboard sync failed");
	});
}

export type GiveResult =
	| { ok: true; points: number }
	| { ok: false; reason: "self" | "cooldown"; remaining: number };

/** Give one reputation point from `fromId` to `toId`, enforcing self + 24h cooldown. */
export async function giveRep(guildId: string, fromId: string, toId: string): Promise<GiveResult> {
	if (fromId === toId) return { ok: false, reason: "self", remaining: 0 };
	const giver = await getRep(guildId, fromId);
	const remaining = cooldownRemaining(giver.lastGiven);
	if (remaining > 0) return { ok: false, reason: "cooldown", remaining };

	const [, receiver] = await getPrisma().$transaction([
		getPrisma().repUser.update({
			where: { guildId_userId: { guildId, userId: fromId } },
			data: { lastGiven: new Date() },
		}),
		getPrisma().repUser.upsert({
			where: { guildId_userId: { guildId, userId: toId } },
			create: { guildId, userId: toId, points: 1 },
			update: { points: { increment: 1 } },
		}),
	]);
	await syncLeaderboard(guildId, toId, receiver.points);
	return { ok: true, points: receiver.points };
}

export interface RepEntry {
	userId: string;
	points: number;
}

/** Top members by reputation (Redis sorted set, DB fallback). */
export async function leaderboard(guildId: string, limit = 10): Promise<RepEntry[]> {
	const redis = getRedis();
	if (redis) {
		const rows = await redis
			.zrevrange(`lb:rep:${guildId}`, 0, limit - 1, "WITHSCORES")
			.catch(() => [] as string[]);
		if (rows.length) {
			const entries: RepEntry[] = [];
			for (let i = 0; i < rows.length; i += 2) {
				entries.push({ userId: rows[i] ?? "", points: Number(rows[i + 1] ?? 0) });
			}
			return entries;
		}
	}
	const rows = await getPrisma().repUser.findMany({
		where: { guildId, points: { gt: 0 } },
		orderBy: { points: "desc" },
		take: limit,
	});
	return rows.map((r) => ({ userId: r.userId, points: r.points }));
}
