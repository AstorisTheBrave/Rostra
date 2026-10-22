import { monitorEventLoopDelay } from "node:perf_hooks";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import { type OperationHandler, PrismaOperationRepository } from "@rostra/operations";
import Redis from "ioredis";
import {
	createWorkerHealthRedis,
	createWorkerHealthServer,
	eventLoopDelayP95Ms,
} from "./health.ts";
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
	runtime.registerOutboxRelay(repository, (error) =>
		log.error({ err: error }, "operation outbox relay failed"),
	);
	runtime.registerReconciler(repository, (error) =>
		log.error({ err: error }, "operation reconciliation failed"),
	);
	runtime.registerScheduler((error) => log.error({ err: error }, "scheduled task poll failed"));
	// The current compatibility registry declares no module jobs. Future worker
	// manifests register through this tracked runtime, never from a gateway shard.
	runtime.registerJobs([]);
	let closing = false;
	const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
	eventLoopDelay.enable();
	const healthRedis = createWorkerHealthRedis(config.redis.url);
	healthRedis.on("error", (error) =>
		log.warn({ err: error }, "worker health Redis connection failed"),
	);
	const health = createWorkerHealthServer({
		internalToken: config.api.internalToken,
		probeDatabase: () => getPrisma().$queryRaw`SELECT 1`,
		probeRedis: () => healthRedis.ping(),
		closing: () => closing,
		metrics: () => ({
			...runtime.diagnostics,
			eventLoopDelayP95Ms: eventLoopDelayP95Ms((percentile) =>
				eventLoopDelay.percentile(percentile),
			),
		}),
	});
	try {
		await new Promise<void>((resolve, reject) => {
			health.once("error", reject);
			health.listen(config.workers.port, config.workers.host, () => {
				health.off("error", reject);
				resolve();
			});
		});
	} catch (error) {
		healthRedis.disconnect();
		eventLoopDelay.disable();
		await drainRuntimeAndDatabase(
			runtime,
			() => disconnectPrisma(),
			(cleanupError) => log.error({ err: cleanupError }, "worker boot cleanup failed"),
		);
		throw error;
	}
	health.on("error", (error) => log.error({ err: error }, "worker health server failed"));
	const close = async (signal: string) => {
		if (closing) return;
		closing = true;
		await new Promise<void>((resolve) => health.close(() => resolve()));
		healthRedis.disconnect();
		eventLoopDelay.disable();
		log.info(
			{ signal, workers: runtime.workerCount, outbox: runtime.outboxMetrics },
			"worker drain started",
		);
		const failed = await drainRuntimeAndDatabase(
			runtime,
			() => disconnectPrisma(),
			(error) => log.error({ err: error }, "worker shutdown cleanup failed"),
		);
		if (failed) process.exitCode = 1;
		log.info("worker drain complete");
	};
	process.on("SIGINT", () => void close("SIGINT"));
	process.on("SIGTERM", () => void close("SIGTERM"));
	log.info({ workers: runtime.workerCount, healthPort: config.workers.port }, "workers started");
}

main().catch((error) => {
	log.error({ err: error }, "worker boot failed");
	process.exitCode = 1;
});
