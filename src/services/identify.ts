import { randomUUID } from "node:crypto";
import { getRedis } from "@/services/cache.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Cross-cluster identify queue. Discord rate-limits gateway IDENTIFYs (large bots
 * get a `max_concurrency` bucket). discord-hybrid-sharding serialises identifies
 * *within* one cluster manager, but across separate cluster processes/machines
 * nothing coordinates them. This is a Redis lock that serialises cluster logins
 * fleet-wide: a cluster waits for the lock, logs in, and releases it once it is
 * READY (or after a TTL). It is conservative (one cluster connects at a time);
 * bots with a higher `max_concurrency` can run several of these buckets.
 */

const log = getLogger("identify");
const KEY = "identify:lock";
const instanceId = randomUUID();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until this cluster may IDENTIFY. No-op without Redis (single host). */
export async function acquireIdentifySlot(ttlMs = 60_000): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	for (let attempt = 0; ; attempt++) {
		const ok = await redis
			.set(KEY, instanceId, "PX", ttlMs, "NX")
			.then((r) => r === "OK")
			.catch(() => false);
		if (ok) {
			log.info("acquired identify slot");
			return;
		}
		if (attempt === 0) log.info("waiting for identify slot");
		await delay(2500);
	}
}

/** Release the identify slot so the next cluster may connect. */
export async function releaseIdentifySlot(): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	const owner = await redis.get(KEY).catch(() => null);
	if (owner === instanceId) {
		await redis.del(KEY).catch(() => {});
		log.info("released identify slot");
	}
}
