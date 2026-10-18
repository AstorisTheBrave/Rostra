import { config } from "@rostra/config";
import { disconnectPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import { type OperationHandler, PrismaOperationRepository } from "@rostra/operations";
import Redis from "ioredis";
import { drainRuntimeAndDatabase, WorkerRuntime } from "./runtime.ts";

const log = getLogger("workers");

async function main(): Promise<void> {
	if (!config.redis.url) throw new Error("Worker runtime requires REDIS_URL");
	const connection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const repository = new PrismaOperationRepository();
	const handlers = new Map<string, OperationHandler>([
		[
			"phase00.smoke",
			async (operation) => {
				const payload = operation.payload;
				const correlationId =
					typeof payload === "object" && payload !== null && "correlationId" in payload
						? payload.correlationId
						: undefined;
				await repository.recordEffect(operation.id, {
					operationId: operation.id,
					correlationId,
					completedAt: new Date().toISOString(),
				});
			},
		],
	]);
	const runtime = new WorkerRuntime(connection);
	runtime.registerOperations(repository, handlers);
	runtime.registerReconciler(repository, (error) =>
		log.error({ err: error }, "operation reconciliation failed"),
	);
	// The current compatibility registry declares no module jobs. Future worker
	// manifests register through this tracked runtime, never from a gateway shard.
	runtime.registerJobs([]);
	let closing = false;
	const close = async (signal: string) => {
		if (closing) return;
		closing = true;
		log.info({ signal, workers: runtime.workerCount }, "worker drain started");
		const failed = await drainRuntimeAndDatabase(runtime, disconnectPrisma, (error) =>
			log.error({ err: error }, "worker shutdown cleanup failed"),
		);
		if (failed) process.exitCode = 1;
		log.info("worker drain complete");
	};
	process.on("SIGINT", () => void close("SIGINT"));
	process.on("SIGTERM", () => void close("SIGTERM"));
	log.info({ workers: runtime.workerCount }, "workers started");
}

main().catch((error) => {
	log.error({ err: error }, "worker boot failed");
	process.exitCode = 1;
});
