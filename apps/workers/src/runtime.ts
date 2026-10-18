import type { JobDefinition } from "@rostra/contracts";
import type {
	OperationHandler,
	OperationPublisher,
	OperationQueuePayload,
	OperationRepository,
} from "@rostra/operations";
import {
	BullMqOperationPublisher,
	PermanentOperationError,
	parseOperationQueuePayload,
	processOperation,
} from "@rostra/operations";
import { type ConnectionOptions, type Job, Worker } from "bullmq";
import type Redis from "ioredis";

interface DrainableWorker {
	close(force?: boolean): Promise<void>;
}

export class OperationReconciler implements DrainableWorker {
	readonly #repository: OperationRepository;
	readonly #publisher: OperationPublisher;
	readonly #intervalMs: number;
	#timer: NodeJS.Timeout | undefined;
	#inFlight: Promise<void> | undefined;

	constructor(repository: OperationRepository, publisher: OperationPublisher, intervalMs = 5_000) {
		this.#repository = repository;
		this.#publisher = publisher;
		this.#intervalMs = intervalMs;
	}

	async runOnce(now = new Date()): Promise<number> {
		const records = await this.#repository.listRecoverable(now, 100);
		const results = await Promise.allSettled(
			records.map((record) => this.#publisher.publish({ version: 1, operationId: record.id })),
		);
		const failures = results
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map((result) => result.reason);
		if (failures.length)
			throw new AggregateError(failures, "One or more operations failed to republish");
		return records.length;
	}

	start(onError: (error: unknown) => void): void {
		const trigger = () => {
			if (this.#inFlight) return;
			this.#inFlight = this.runOnce()
				.then(() => undefined)
				.catch(onError)
				.finally(() => {
					this.#inFlight = undefined;
				});
		};
		trigger();
		this.#timer = setInterval(trigger, this.#intervalMs);
	}

	async close(): Promise<void> {
		if (this.#timer) clearInterval(this.#timer);
		await this.#inFlight;
	}
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
		if (outcome === "retryable" || outcome === "busy")
			throw new Error(outcome === "busy" ? "operation_busy" : "retryable_operation_failure");
	};
}

export class WorkerRuntime {
	readonly #connection: Redis;
	readonly #tracked: TrackedWorkers;

	constructor(connection: Redis, tracked = new TrackedWorkers()) {
		this.#connection = connection;
		this.#tracked = tracked;
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

	registerReconciler(
		repository: OperationRepository,
		onError: (error: unknown) => void,
		intervalMs = 5_000,
	): void {
		const publisher = new BullMqOperationPublisher(
			this.#connection as unknown as ConnectionOptions,
		);
		const reconciler = new OperationReconciler(repository, publisher, intervalMs);
		this.#tracked.track({
			async close() {
				try {
					await reconciler.close();
				} finally {
					await publisher.close();
				}
			},
		});
		reconciler.start(onError);
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

export async function drainRuntimeAndDatabase(
	runtime: Pick<WorkerRuntime, "drain">,
	disconnectDatabase: () => Promise<void>,
	onError: (error: unknown) => void,
): Promise<boolean> {
	let failed = false;
	try {
		await runtime.drain();
	} catch (error) {
		failed = true;
		onError(error);
	} finally {
		try {
			await disconnectDatabase();
		} catch (error) {
			failed = true;
			onError(error);
		}
	}
	return failed;
}
