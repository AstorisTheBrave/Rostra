import { getLogger } from "@rostra/logger";
import type Redis from "ioredis";
import { getRedis } from "./index.ts";

const log = getLogger("bus");
type Handler = (payload: unknown) => void;
const IO_TIMEOUT_MS = 2_000;

function bounded<T>(operation: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		operation,
		new Promise<T>((_, reject) => {
			timer = setTimeout(() => reject(new Error("bus operation timed out")), IO_TIMEOUT_MS);
		}),
	]).finally(() => clearTimeout(timer));
}

export interface CacheInvalidationV1 {
	schemaVersion: 1;
	owner: string;
	tenant: string;
	key: string;
	version: string;
}

export type PublicationOutcome =
	| { status: "published" }
	| { status: "ttl-fallback"; reason: string };
export type Subscription = { ready: Promise<PublicationOutcome>; dispose: () => void };

export function parseCacheInvalidation(value: unknown): CacheInvalidationV1 | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const msg = value as Record<string, unknown>;
	if (
		msg.schemaVersion !== 1 ||
		typeof msg.owner !== "string" ||
		!/^[a-z][a-zA-Z0-9]{0,63}$/.test(msg.owner) ||
		typeof msg.tenant !== "string" ||
		!/^(guild|user):[A-Za-z0-9_-]{1,128}$/.test(msg.tenant) ||
		typeof msg.key !== "string" ||
		!/^[A-Za-z0-9:_-]{1,256}$/.test(msg.key) ||
		typeof msg.version !== "string" ||
		msg.version.length > 19 ||
		!/^[1-9]\d*$/.test(msg.version) ||
		BigInt(msg.version) > 9223372036854775807n
	)
		return null;
	return msg as unknown as CacheInvalidationV1;
}

/** Injectable transport boundary for duplicate, failure and reconnect proofs. */
export function createControlBus(redisProvider: () => Redis | undefined) {
	const handlers = new Map<string, Set<Handler>>();
	const subscribed = new Set<string>();
	const pending = new Map<string, Promise<PublicationOutcome>>();
	let subscriber: Redis | undefined;
	let generation = 0;

	function dispatch(channel: string, payload: unknown): void {
		for (const handler of handlers.get(channel) ?? []) {
			try {
				handler(payload);
			} catch (err) {
				log.error({ err, channel }, "bus handler failed");
			}
		}
	}

	function ensureSubscriber(): Redis | undefined {
		if (subscriber) return subscriber;
		const redis = redisProvider();
		if (!redis) return undefined;
		subscriber = redis.duplicate({ autoResubscribe: false });
		subscriber.on("error", (err) => log.error({ err }, "bus subscriber error"));
		subscriber.on("message", (channel, message) => {
			let payload: unknown;
			try {
				payload = JSON.parse(message);
			} catch {
				log.warn({ channel }, "invalid bus JSON ignored");
				return;
			}
			dispatch(channel, payload);
		});
		subscriber.on("reconnecting", () => {
			generation++;
			subscribed.clear();
			pending.clear();
		});
		subscriber.on("ready", () => {
			for (const channel of handlers.keys()) {
				if (!subscribed.has(channel)) void subscribeChannel(channel);
			}
		});
		return subscriber;
	}

	function subscribeChannel(channel: string): Promise<PublicationOutcome> {
		const client = ensureSubscriber();
		if (!client) return Promise.resolve({ status: "ttl-fallback", reason: "redis-absent" });
		if (subscribed.has(channel)) return Promise.resolve({ status: "published" });
		const inFlight = pending.get(channel);
		if (inFlight) return inFlight;
		const started = generation;
		const attempt: Promise<PublicationOutcome> = bounded(client.subscribe(channel)).then(
			() => {
				if (started === generation && handlers.has(channel)) subscribed.add(channel);
				else if (!handlers.has(channel))
					void client
						.unsubscribe(channel)
						.catch((err) => log.error({ err, channel }, "bus unsubscribe failed"));
				return { status: "published" };
			},
			(err: unknown) => {
				log.error({ err, channel }, "bus subscribe failed");
				return { status: "ttl-fallback", reason: "subscribe-failed" };
			},
		);
		pending.set(channel, attempt);
		void attempt.finally(() => {
			if (pending.get(channel) === attempt) pending.delete(channel);
		});
		return attempt;
	}

	async function publish(channel: string, payload: unknown): Promise<PublicationOutcome> {
		const redis = redisProvider();
		if (!redis) {
			dispatch(channel, payload);
			return { status: "ttl-fallback", reason: "redis-absent" };
		}
		try {
			if (redis.status !== "ready") throw new Error("redis is not ready");
			await bounded(redis.publish(channel, JSON.stringify(payload)));
			return { status: "published" };
		} catch (err) {
			log.error({ err, channel }, "bus publish failed");
			return { status: "ttl-fallback", reason: "publish-failed" };
		}
	}

	function subscribe(channel: string, handler: Handler): Subscription {
		let set = handlers.get(channel);
		if (!set) {
			set = new Set();
			handlers.set(channel, set);
		}
		set.add(handler);
		let disposed = false;
		return {
			ready: subscribeChannel(channel),
			dispose: () => {
				if (disposed) return;
				disposed = true;
				set?.delete(handler);
				if (set?.size) return;
				handlers.delete(channel);
				subscribed.delete(channel);
				if (!pending.has(channel))
					void subscriber
						?.unsubscribe(channel)
						.catch((err) => log.error({ err, channel }, "bus unsubscribe failed"));
			},
		};
	}

	function close(): void {
		subscriber?.disconnect();
		subscriber = undefined;
		generation++;
		subscribed.clear();
		pending.clear();
		handlers.clear();
	}
	return { publish, subscribe, close };
}

const bus = createControlBus(getRedis);
export const publish = bus.publish;
export const subscribe = bus.subscribe;
export const closeBus = bus.close;
