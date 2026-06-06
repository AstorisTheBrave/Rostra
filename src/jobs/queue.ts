import type { ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import type { JobDefinition } from "@/types/module.ts";

const log = getLogger("jobs");

const handlers = new Map<string, JobDefinition>();
const queues = new Map<string, Queue>();
let connection: Redis | undefined;

function getConnection(): Redis | undefined {
	if (!config.redis.url) return undefined;
	if (!connection) {
		connection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
		connection.on("error", (err) => log.error({ err }, "jobs redis error"));
	}
	return connection;
}

/**
 * Register a job. With Redis present, creates a BullMQ Queue + Worker (and a repeatable
 * entry when `cron` is set). Without Redis, the handler is kept for in-memory `enqueue`
 * (immediate/delayed); cron scheduling requires Redis and is skipped with a warning.
 */
export async function registerJob(def: JobDefinition): Promise<void> {
	handlers.set(def.name, def);
	const conn = getConnection();
	if (!conn) {
		if (def.cron) log.warn({ job: def.name }, "cron job requires REDIS_URL — not scheduled");
		return;
	}
	const { Queue: BullQueue, Worker } = await import("bullmq");
	// BullMQ bundles its own ioredis copy; the instance is runtime-compatible but its type
	// differs nominally, so cast through the BullMQ ConnectionOptions type.
	const connOpt = conn as unknown as ConnectionOptions;
	const queue = new BullQueue(def.name, { connection: connOpt });
	queues.set(def.name, queue);
	new Worker(def.name, async (job) => def.handler(job.data), { connection: connOpt });
	if (def.cron) {
		await queue.add(def.name, {}, { repeat: { pattern: def.cron }, jobId: `cron:${def.name}` });
	}
}

/** Enqueue a payload for a registered job (BullMQ when available, else in-process). */
export async function enqueue(
	name: string,
	payload: unknown,
	opts: { delayMs?: number } = {},
): Promise<void> {
	const queue = queues.get(name);
	if (queue) {
		await queue.add(name, payload, opts.delayMs ? { delay: opts.delayMs } : {});
		return;
	}
	const def = handlers.get(name);
	if (!def) {
		log.warn({ job: name }, "enqueue for unknown job");
		return;
	}
	if (opts.delayMs) setTimeout(() => void Promise.resolve(def.handler(payload)), opts.delayMs);
	else void Promise.resolve(def.handler(payload));
}

export async function disconnectJobs(): Promise<void> {
	for (const queue of queues.values()) await queue.close();
	queues.clear();
	if (connection) {
		connection.disconnect();
		connection = undefined;
	}
}
