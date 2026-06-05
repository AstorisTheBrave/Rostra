import { getRedis } from "@/services/cache.ts";

const memory = new Map<string, number>();

export interface CooldownResult {
	ok: boolean;
	retryAfterMs: number;
}

/**
 * Token-bucket cooldown. Uses Redis (`SET key PX ms NX`) when available so cooldowns are
 * shared across shards; falls back to a per-process Map otherwise.
 */
export async function consume(key: string, ms: number): Promise<CooldownResult> {
	const redis = getRedis();
	if (redis) {
		const set = await redis.set(`cd:${key}`, "1", "PX", ms, "NX");
		if (set === "OK") return { ok: true, retryAfterMs: 0 };
		const ttl = await redis.pttl(`cd:${key}`);
		return { ok: false, retryAfterMs: ttl > 0 ? ttl : ms };
	}
	const now = Date.now();
	const expiry = memory.get(key) ?? 0;
	if (now < expiry) return { ok: false, retryAfterMs: expiry - now };
	memory.set(key, now + ms);
	return { ok: true, retryAfterMs: 0 };
}
