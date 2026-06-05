import { getLogger } from "@/services/logger.ts";

const log = getLogger("shutdown");

type ShutdownTask = () => Promise<void> | void;

const tasks: ShutdownTask[] = [];
let shuttingDown = false;

/** Register a task to run on graceful shutdown (LIFO not guaranteed; run in registration order). */
export function registerShutdown(task: ShutdownTask): void {
	tasks.push(task);
}

/** Install SIGINT/SIGTERM handlers that drain registered tasks then exit. */
export function installShutdownHandlers(): void {
	const run = async (signal: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		log.info({ signal }, "graceful shutdown started");
		for (const task of tasks) {
			try {
				await task();
			} catch (err) {
				log.error({ err }, "shutdown task failed");
			}
		}
		log.info("graceful shutdown complete");
		process.exit(0);
	};
	process.on("SIGINT", () => void run("SIGINT"));
	process.on("SIGTERM", () => void run("SIGTERM"));
}
