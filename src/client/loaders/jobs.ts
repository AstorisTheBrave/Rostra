import { registerJob } from "@/jobs/queue.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule } from "@/types/module.ts";

const log = getLogger("loader:jobs");

/** Register every module's job definitions with the queue. */
export async function registerJobs(modules: BotModule[]): Promise<void> {
	let count = 0;
	for (const module of modules) {
		for (const job of module.jobs ?? []) {
			await registerJob(job);
			count++;
		}
	}
	log.info({ count }, "jobs registered");
}
