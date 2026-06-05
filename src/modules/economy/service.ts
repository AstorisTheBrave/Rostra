import { getRedis } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import type { EconomyUser } from "@prisma/client";

const log = getLogger("economy");

export const CURRENCY = "🪙";
export const MAX_BALANCE = 1_000_000_000;

export const COOLDOWNS = {
	daily: 24 * 60 * 60 * 1000,
	work: 60 * 60 * 1000,
	crime: 60 * 60 * 1000,
	rob: 2 * 60 * 60 * 1000,
} as const;

/** Format an integer amount with the currency symbol and thousands separators. */
export function formatCoins(amount: number): string {
	return `${CURRENCY} ${amount.toLocaleString("en-US")}`;
}

/** Remaining cooldown in ms (0 if ready). */
export function cooldownRemaining(last: Date | null, durationMs: number, now = Date.now()): number {
	if (!last) return 0;
	const elapsed = now - last.getTime();
	return elapsed >= durationMs ? 0 : durationMs - elapsed;
}

const clamp = (n: number): number => Math.max(0, Math.min(MAX_BALANCE, Math.round(n)));

export async function getAccount(guildId: string, userId: string): Promise<EconomyUser> {
	return getPrisma().economyUser.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId },
		update: {},
	});
}

async function syncLeaderboard(guildId: string, userId: string, total: number): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	await redis.zadd(`lb:eco:${guildId}`, total, userId).catch((err) => {
		log.error({ err }, "leaderboard sync failed");
	});
}

/** Apply deltas to wallet/bank (clamped), persist, and refresh the leaderboard. */
export async function updateBalance(
	guildId: string,
	userId: string,
	delta: { wallet?: number; bank?: number; extra?: Partial<EconomyUser> },
): Promise<EconomyUser> {
	const account = await getAccount(guildId, userId);
	const wallet = clamp(account.wallet + (delta.wallet ?? 0));
	const bank = clamp(account.bank + (delta.bank ?? 0));
	const updated = await getPrisma().economyUser.update({
		where: { guildId_userId: { guildId, userId } },
		data: { wallet, bank, ...delta.extra },
	});
	await syncLeaderboard(guildId, userId, updated.wallet + updated.bank);
	return updated;
}

export interface LeaderboardEntry {
	userId: string;
	total: number;
}

/** Top accounts by total net worth (Redis sorted set, DB fallback). */
export async function leaderboard(guildId: string, limit = 10): Promise<LeaderboardEntry[]> {
	const redis = getRedis();
	if (redis) {
		const rows = await redis
			.zrevrange(`lb:eco:${guildId}`, 0, limit - 1, "WITHSCORES")
			.catch(() => [] as string[]);
		if (rows.length) {
			const entries: LeaderboardEntry[] = [];
			for (let i = 0; i < rows.length; i += 2) {
				entries.push({ userId: rows[i] ?? "", total: Number(rows[i + 1] ?? 0) });
			}
			return entries;
		}
	}
	const accounts = await getPrisma().economyUser.findMany({
		where: { guildId },
		orderBy: [{ wallet: "desc" }],
		take: limit,
	});
	return accounts
		.map((a) => ({ userId: a.userId, total: a.wallet + a.bank }))
		.sort((x, y) => y.total - x.total);
}
