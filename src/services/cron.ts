import { getLogger } from "@/services/logger.ts";

/**
 * Centralized recurring-job registry. Jobs run in the manager process, so each
 * fires once for the whole cluster (not per shard). Jobs that need guild data
 * can `broadcastEval` from their handler; DB/cleanup jobs need nothing extra.
 * BullMQ (`src/jobs/queue.ts`) remains available for distributed queue work.
 */

const log = getLogger("cron");

export interface CronJob {
	name: string;
	/** Interval between runs, in milliseconds. */
	everyMs: number;
	handler: () => Promise<void> | void;
	/** Run once immediately on start (in addition to the interval). */
	runOnStart?: boolean;
}

const jobs: CronJob[] = [];
const timers: NodeJS.Timeout[] = [];

/** Register a recurring job. Call before `startCron()`. */
export function registerCron(job: CronJob): void {
	jobs.push(job);
}

/** The registered jobs (for tests / introspection). */
export function listCronJobs(): readonly CronJob[] {
	return jobs;
}

/** Start all registered jobs. Safe to call once (e.g. in the manager boot). */
export function startCron(): void {
	for (const job of jobs) {
		const run = async () => {
			try {
				await job.handler();
			} catch (err) {
				log.error({ err, job: job.name }, "cron job failed");
			}
		};
		if (job.runOnStart) void run();
		const timer = setInterval(run, job.everyMs);
		timer.unref?.();
		timers.push(timer);
	}
	log.info({ count: jobs.length }, "cron jobs started");
}

/** Stop all running jobs (used on shutdown / in tests). */
export function stopCron(): void {
	for (const timer of timers) clearInterval(timer);
	timers.length = 0;
}
