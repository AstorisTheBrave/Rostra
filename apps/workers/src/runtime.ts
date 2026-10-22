import type { JobDefinition } from "@rostra/contracts";
import type {
	OperationHandler,
	OperationOutboxRepository,
	OperationPublisher,
	OperationQueuePayload,
	OperationRepository,
} from "@rostra/operations";
import {
	BullMqOperationPublisher,
	OPERATION_PRODUCER_OPTIONS,
	PermanentOperationError,
	PrismaScheduledTaskRepository,
	parseOperationQueuePayload,
	processOperation,
	publishClaimedOutbox,
	SCHEDULED_TASK_CHANNEL,
	SCHEDULED_TASK_LEASE_MS,
	type ScheduledTaskRepository,
} from "@rostra/operations";
import { type ConnectionOptions, type Job, Worker } from "bullmq";
import Redis, { type RedisOptions } from "ioredis";

interface DrainableWorker {
	close(force?: boolean): Promise<void>;
}

type ScheduledDispatch = (channel: string, payload: unknown) => Promise<PublicationOutcome>;
type PublicationOutcome = { status: "published" } | { status: "ttl-fallback"; reason: string };

/** Independent finite-failure Redis producer; the BullMQ Worker connection keeps its own policy. */
export class ScheduledTaskPublisher {
	readonly #options: RedisOptions;
	readonly #url: string | undefined;
	#connection: Redis | undefined;
	#closed = false;

	constructor(connection: RedisOptions | string) {
		this.#url = typeof connection === "string" ? connection : undefined;
		this.#options = {
			...(typeof connection === "string" ? {} : connection),
			...OPERATION_PRODUCER_OPTIONS,
			lazyConnect: true,
		};
	}

	async publish(channel: string, payload: unknown): Promise<PublicationOutcome> {
		if (this.#closed) throw new Error("Scheduled task publisher is closed");
		if (!this.#connection) {
			this.#connection = this.#url ? new Redis(this.#url, this.#options) : new Redis(this.#options);
			this.#connection.on("error", () => {});
		}
		const connection = this.#connection;
		try {
			if (connection.status === "wait") await connection.connect();
			if (connection.status !== "ready") throw new Error("scheduled_dispatch_unavailable");
			await connection.publish(channel, JSON.stringify(payload));
			return { status: "published" };
		} catch (error) {
			connection.disconnect();
			if (this.#connection === connection) this.#connection = undefined;
			throw error;
		}
	}

	async close(): Promise<void> {
		this.#closed = true;
		this.#connection?.disconnect();
		this.#connection = undefined;
	}
}

export class SchedulerPoller implements DrainableWorker {
	readonly #repository: Pick<ScheduledTaskRepository, "claimDue" | "deferPublication">;
	readonly #publish: ScheduledDispatch;
	readonly #intervalMs: number;
	#timer: NodeJS.Timeout | undefined;
	#inFlight: Promise<void> | undefined;
	#closing = false;
	#successes = 0;
	#failures = 0;
	#lastSuccessAt = 0;
	#lastPollOk = false;

	constructor(
		repository: Pick<ScheduledTaskRepository, "claimDue" | "deferPublication">,
		publishDispatch: ScheduledDispatch,
		intervalMs = 5_000,
	) {
		this.#repository = repository;
		this.#publish = publishDispatch;
		this.#intervalMs = intervalMs;
	}

	async runOnce(now = new Date()): Promise<number> {
		if (this.#closing) return 0;
		try {
			const claims = await this.#repository.claimDue(now, 20, SCHEDULED_TASK_LEASE_MS);
			const failures: unknown[] = [];
			let deliveryUnavailable = false;
			for (const claim of claims) {
				if (deliveryUnavailable) {
					try {
						await this.#repository.deferPublication(claim.id, claim.claimVersion, new Date());
					} catch (error) {
						failures.push(error);
					}
					continue;
				}
				try {
					const outcome = await this.#publish(SCHEDULED_TASK_CHANNEL, {
						version: 1,
						taskId: claim.id,
						claimVersion: claim.claimVersion,
					});
					if (outcome.status !== "published") throw new Error("scheduled_dispatch_unavailable");
				} catch (error) {
					deliveryUnavailable = true;
					try {
						await this.#repository.deferPublication(claim.id, claim.claimVersion, new Date());
					} catch (settlementError) {
						failures.push(settlementError);
					}
					failures.push(error);
				}
			}
			if (failures.length) throw new AggregateError(failures, "Scheduled dispatch deferred");
			this.#successes++;
			this.#lastSuccessAt = Date.now();
			this.#lastPollOk = true;
			return claims.length;
		} catch (error) {
			this.#failures++;
			this.#lastPollOk = false;
			throw error;
		}
	}

	get health() {
		return {
			successes: this.#successes,
			failures: this.#failures,
			lastSuccessAt: this.#lastSuccessAt,
			lastPollOk: this.#lastPollOk,
		};
	}

	start(onError: (error: unknown) => void): void {
		const trigger = () => {
			if (this.#closing || this.#inFlight) return;
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
		this.#closing = true;
		if (this.#timer) clearInterval(this.#timer);
		await this.#inFlight;
	}
}

export class OutboxRelay implements DrainableWorker {
	readonly #repository: OperationOutboxRepository;
	readonly #publisher: OperationPublisher;
	readonly #intervalMs: number;
	#timer: NodeJS.Timeout | undefined;
	#inFlight: Promise<void> | undefined;
	#closing = false;
	#claimed = 0;
	#published = 0;
	#deferred = 0;
	#successes = 0;
	#failures = 0;
	#lastSuccessAt = 0;
	#lastPollOk = false;

	constructor(
		repository: OperationOutboxRepository,
		publisher: OperationPublisher,
		intervalMs = 5_000,
	) {
		this.#repository = repository;
		this.#publisher = publisher;
		this.#intervalMs = intervalMs;
	}

	async runOnce(now = new Date()): Promise<number> {
		try {
			const claims = await this.#repository.claimDueOutbox(now, 20, 30_000);
			this.#claimed += claims.length;
			const failures: unknown[] = [];
			for (let index = 0; index < claims.length; index += 2) {
				const results = await Promise.allSettled(
					claims.slice(index, index + 2).map(async (claim) => {
						if (!(await publishClaimedOutbox(this.#repository, this.#publisher, claim)))
							throw new Error("outbox_publish_deferred");
					}),
				);
				failures.push(
					...results
						.filter((result): result is PromiseRejectedResult => result.status === "rejected")
						.map((result) => result.reason),
				);
				this.#published += results.filter((result) => result.status === "fulfilled").length;
				this.#deferred += results.filter((result) => result.status === "rejected").length;
			}
			if (failures.length)
				throw new AggregateError(failures, "Outbox relay deferred one or more operations");
			this.#successes++;
			this.#lastSuccessAt = Date.now();
			this.#lastPollOk = true;
			return claims.length;
		} catch (error) {
			this.#failures++;
			this.#lastPollOk = false;
			throw error;
		}
	}

	get health() {
		return {
			successes: this.#successes,
			failures: this.#failures,
			lastSuccessAt: this.#lastSuccessAt,
			lastPollOk: this.#lastPollOk,
		};
	}

	get metrics(): { claimed: number; published: number; deferred: number } {
		return { claimed: this.#claimed, published: this.#published, deferred: this.#deferred };
	}

	start(onError: (error: unknown) => void): void {
		const trigger = () => {
			if (this.#closing || this.#inFlight) return;
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
		this.#closing = true;
		if (this.#timer) clearInterval(this.#timer);
		await this.#inFlight;
	}
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
	onLag: (lagMs: number) => void = () => {},
	onRetry: (outcome: "retryable" | "busy") => void = () => {},
): (job: Job<unknown>) => Promise<void> {
	return async (job) => {
		onLag(Math.max(0, Date.now() - (Number.isFinite(job.timestamp) ? job.timestamp : Date.now())));
		let payload: OperationQueuePayload;
		try {
			payload = parseOperationQueuePayload(job.data);
		} catch (error) {
			if (error instanceof PermanentOperationError) return;
			throw error;
		}
		const outcome = await processOperation(repository, handlers, payload);
		if (outcome === "retryable" || outcome === "busy") {
			onRetry(outcome);
			throw new Error(outcome === "busy" ? "operation_busy" : "retryable_operation_failure");
		}
	};
}

export class WorkerRuntime {
	readonly #connection: Redis;
	readonly #tracked: TrackedWorkers;
	#outboxRelay: OutboxRelay | undefined;
	#scheduler: SchedulerPoller | undefined;
	#queueLagMs = 0;
	#operationRetries = 0;
	#operationBusy = 0;

	constructor(connection: Redis, tracked = new TrackedWorkers()) {
		this.#connection = connection;
		this.#tracked = tracked;
	}

	get workerCount(): number {
		return this.#tracked.size;
	}

	get outboxMetrics(): { claimed: number; published: number; deferred: number } | undefined {
		return this.#outboxRelay?.metrics;
	}

	get diagnostics() {
		return {
			outbox: this.#outboxRelay
				? { ...this.#outboxRelay.metrics, ...this.#outboxRelay.health }
				: undefined,
			scheduler: this.#scheduler?.health,
			queueLagMs: this.#queueLagMs,
			operationRetries: this.#operationRetries,
			operationBusy: this.#operationBusy,
		};
	}

	registerOperations(
		repository: OperationRepository,
		handlers: ReadonlyMap<string, OperationHandler>,
	): void {
		this.#tracked.track(
			new Worker<OperationQueuePayload>(
				"operations",
				createOperationProcessor(
					repository,
					handlers,
					(lagMs) => {
						this.#queueLagMs = lagMs;
					},
					(outcome) => {
						if (outcome === "retryable") this.#operationRetries++;
						else this.#operationBusy++;
					},
				),
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
		const publisher = new BullMqOperationPublisher(this.#producerConnection());
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

	registerOutboxRelay(
		repository: OperationOutboxRepository,
		onError: (error: unknown) => void,
		intervalMs = 5_000,
	): void {
		const publisher = new BullMqOperationPublisher(this.#producerConnection());
		const relay = new OutboxRelay(repository, publisher, intervalMs);
		this.#outboxRelay = relay;
		this.#tracked.track({
			async close() {
				try {
					await relay.close();
				} finally {
					await publisher.close();
				}
			},
		});
		relay.start(onError);
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

	registerScheduler(onError: (error: unknown) => void, intervalMs = 5_000): void {
		const publisher = new ScheduledTaskPublisher(this.#producerConnection() as RedisOptions);
		const poller = new SchedulerPoller(
			new PrismaScheduledTaskRepository(),
			(channel, payload) => publisher.publish(channel, payload),
			intervalMs,
		);
		this.#scheduler = poller;
		this.#tracked.track({
			async close() {
				try {
					await poller.close();
				} finally {
					await publisher.close();
				}
			},
		});
		poller.start(onError);
	}

	#producerConnection(): ConnectionOptions {
		return { ...this.#connection.options, ...OPERATION_PRODUCER_OPTIONS } as ConnectionOptions;
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
