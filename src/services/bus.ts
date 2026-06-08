import type Redis from "ioredis";
import { getRedis } from "@/services/cache.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * A tiny Redis pub/sub control bus for fleet-wide, zero-restart coordination.
 * Used to fan out "something changed, refresh it" signals to every shard (e.g.
 * live translation reloads, global config invalidation). Pub/sub needs its own
 * connection, so the subscriber duplicates the cache's ioredis client. Without
 * Redis (single-process dev) publish is a no-op and the caller applies changes
 * locally, so behaviour is identical at any scale.
 */

const log = getLogger("bus");

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
let subscriber: Redis | undefined;

function ensureSubscriber(): Redis | undefined {
	if (subscriber) return subscriber;
	const redis = getRedis();
	if (!redis) return undefined;
	subscriber = redis.duplicate();
	subscriber.on("error", (err) => log.error({ err }, "bus subscriber error"));
	subscriber.on("message", (channel, message) => {
		const set = handlers.get(channel);
		if (!set) return;
		let payload: unknown = message;
		try {
			payload = JSON.parse(message);
		} catch {
			// keep the raw string
		}
		for (const handler of set) {
			try {
				handler(payload);
			} catch (err) {
				log.error({ err, channel }, "bus handler failed");
			}
		}
	});
	return subscriber;
}

/** Publish a message to every shard subscribed to `channel`. No-op without Redis. */
export async function publish(channel: string, payload: unknown): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	await redis
		.publish(channel, JSON.stringify(payload))
		.catch((err) => log.error({ err, channel }, "bus publish failed"));
}

/** Subscribe this shard to `channel`; `handler` runs for every published message. */
export function subscribe(channel: string, handler: Handler): void {
	let set = handlers.get(channel);
	if (!set) {
		set = new Set();
		handlers.set(channel, set);
	}
	set.add(handler);
	ensureSubscriber()
		?.subscribe(channel)
		.catch((err) => log.error({ err, channel }, "bus subscribe failed"));
}

/** Close the bus subscriber connection (shutdown). */
export function closeBus(): void {
	subscriber?.disconnect();
	subscriber = undefined;
	handlers.clear();
}
