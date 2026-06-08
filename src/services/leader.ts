import { randomUUID } from "node:crypto";
import { getRedis } from "@/services/cache.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Redis leader election so single-instance work (the manager-process crons:
 * feeds, server-stats, autopost, command sync) runs on exactly ONE process
 * across the whole cluster fleet. Without clustering there is one manager and
 * this is a trivial yes; with hybrid clustering there are several cluster
 * managers, and this prevents every one of them from double-running the jobs.
 * Leadership is a Redis key with a TTL that the leader renews; if the leader
 * dies, the key expires and a standby takes over (`startWhenLeader`).
 */

const log = getLogger("leader");
const instanceId = randomUUID();
const renewers = new Map<string, NodeJS.Timeout>();

const lockKey = (key: string) => `leader:${key}`;

/** Try to acquire (or confirm) leadership for `key`. Returns true if we hold it. */
export async function acquireLeadership(key: string, ttlMs = 30_000): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return true; // single process: trivially the leader
	const lk = lockKey(key);
	const acquired = await redis
		.set(lk, instanceId, "PX", ttlMs, "NX")
		.then((r) => r === "OK")
		.catch(() => false);
	if (!acquired) {
		const owner = await redis.get(lk).catch(() => null);
		if (owner !== instanceId) return false; // someone else leads
	}
	startRenewing(key, ttlMs);
	return true;
}

function startRenewing(key: string, ttlMs: number): void {
	if (renewers.has(key)) return;
	const timer = setInterval(() => void renew(key, ttlMs), Math.max(1000, Math.floor(ttlMs / 2)));
	timer.unref?.();
	renewers.set(key, timer);
}

async function renew(key: string, ttlMs: number): Promise<void> {
	const redis = getRedis();
	if (!redis) return;
	const lk = lockKey(key);
	const owner = await redis.get(lk).catch(() => null);
	if (owner === instanceId) {
		await redis.pexpire(lk, ttlMs).catch(() => {});
	} else {
		const timer = renewers.get(key);
		if (timer) clearInterval(timer);
		renewers.delete(key);
		log.warn({ key }, "lost leadership");
	}
}

/**
 * Run `start()` once this instance becomes leader for `key`, and keep polling so
 * a standby takes over if the current leader dies. `start` is invoked at most
 * once per leadership tenure.
 */
export async function startWhenLeader(
	key: string,
	start: () => void | Promise<void>,
	ttlMs = 30_000,
): Promise<void> {
	let started = false;
	const attempt = async (): Promise<void> => {
		if (started) return;
		if (await acquireLeadership(key, ttlMs)) {
			started = true;
			log.info({ key, instanceId }, "became leader - starting single-instance work");
			await start();
		}
	};
	await attempt();
	if (!started) {
		const poll = setInterval(() => void attempt(), ttlMs);
		poll.unref?.();
	}
}

/** Stop renewing all held leases (shutdown); their TTLs then expire for failover. */
export function releaseLeadership(): void {
	for (const timer of renewers.values()) clearInterval(timer);
	renewers.clear();
}
