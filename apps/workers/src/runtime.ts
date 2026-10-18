import type { JobDefinition } from "@rostra/contracts";
import type {
	OperationHandler,
	OperationQueuePayload,
	OperationRepository,
} from "@rostra/operations";
import {
	PermanentOperationError,
	parseOperationQueuePayload,
	processOperation,
} from "@rostra/operations";
import { type ConnectionOptions, type Job, Worker } from "bullmq";
import type Redis from "ioredis";

interface DrainableWorker {
	close(force?: boolean): Promise<void>;
}

export class TrackedWorkers {
	readonly #workers = new Set<DrainableWorker>();

	track<T extends DrainableWorker>(worker: T): T {
		this.#workers.add(worker);
		return worker;
	}

	get size(): number {
		return this.#workers.size;
	}

	async drain(): Promise<void> {
		const workers = [...this.#workers];
		const results = await Promise.allSettled(workers.map((worker) => worker.close(false)));
		for (const worker of workers) this.#workers.delete(worker);
		const failures = results
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map((result) => result.reason);
		if (failures.length) throw new AggregateError(failures, "One or more workers failed to drain");
	}
}

export function createOperationProcessor(
	repository: OperationRepository,
	handlers: ReadonlyMap<string, OperationHandler>,
): (job: Job<unknown>) => Promise<void> {
	return async (job) => {
		let payload: OperationQueuePayload;
		try {
			payload = parseOperationQueuePayload(job.data);
		} catch (error) {
			if (error instanceof PermanentOperationError) return;
			throw error;
		}
		const outcome = await processOperation(repository, handlers, payload);
		if (outcome === "retryable") throw new Error("retryable_operation_failure");
	};
}

export class WorkerRuntime {
	readonly #connection: Redis;
	readonly #tracked = new TrackedWorkers();

	constructor(connection: Redis) {
		this.#connection = connection;
	}

	get workerCount(): number {
		return this.#tracked.size;
	}

	registerOperations(
		repository: OperationRepository,
		handlers: ReadonlyMap<string, OperationHandler>,
	): void {
		this.#tracked.track(
			new Worker<OperationQueuePayload>(
				"operations",
				createOperationProcessor(repository, handlers),
				{
					connection: this.#connection as unknown as ConnectionOptions,
					concurrency: 2,
				},
			),
		);
	}

	registerJobs(definitions: readonly JobDefinition[]): void {
		for (const definition of definitions) {
			this.#tracked.track(
				new Worker(definition.name, async (job) => Promise.resolve(definition.handler(job.data)), {
					connection: this.#connection as unknown as ConnectionOptions,
					concurrency: 2,
				}),
			);
		}
	}

	async drain(): Promise<void> {
		try {
			await this.#tracked.drain();
		} finally {
			this.#connection.disconnect();
		}
	}
}
