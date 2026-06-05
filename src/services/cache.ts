import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import KeyvRedis from "@keyv/redis";
import Redis from "ioredis";
import Keyv from "keyv";

const log = getLogger("cache");

let keyv: Keyv | undefined;
let redis: Redis | undefined;

function init(): Keyv {
	if (keyv) return keyv;
	if (config.redis.url) {
		// Keyv uses its own connection via URL; a separate ioredis client is kept
		// for raw sorted-set ops (leaderboards) that Keyv does not expose.
		keyv = new Keyv({ store: new KeyvRedis(config.redis.url), namespace: "rostra" });
		redis = new Redis(config.redis.url, { maxRetriesPerRequest: null, lazyConnect: false });
		redis.on("error", (err) => log.error({ err }, "redis error"));
		log.info("cache backed by redis");
	} else {
		keyv = new Keyv({ namespace: "rostra" });
		log.warn("REDIS_URL unset — using in-memory cache (not shared across shards)");
	}
	keyv.on("error", (err) => log.error({ err }, "cache error"));
	return keyv;
}

/** The Keyv instance (Redis or memory). */
export function getCache(): Keyv {
	return init();
}

/** Raw ioredis client for sorted-set ops (leaderboards). Undefined when no Redis. */
export function getRedis(): Redis | undefined {
	init();
	return redis;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
	return (await getCache().get(key)) as T | undefined;
}

export async function cacheSet<T>(key: string, value: T, ttlMs?: number): Promise<void> {
	await getCache().set(key, value, ttlMs);
}

export async function cacheDel(key: string): Promise<void> {
	await getCache().delete(key);
}

export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	const hit = await cacheGet<T>(key);
	if (hit !== undefined) return hit;
	const value = await fn();
	await cacheSet(key, value, ttlMs);
	return value;
}

export async function disconnectCache(): Promise<void> {
	await keyv?.disconnect?.();
	if (redis) {
		redis.disconnect();
		redis = undefined;
	}
	keyv = undefined;
}
