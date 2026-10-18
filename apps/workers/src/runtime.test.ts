import assert from "node:assert/strict";
import { test } from "node:test";
import type { OperationFailure, OperationRecord, OperationRepository } from "@rostra/operations";
import { RetryableOperationError } from "@rostra/operations";
import {
	createOperationProcessor,
	drainRuntimeAndDatabase,
	OperationReconciler,
	TrackedWorkers,
	WorkerRuntime,
} from "./runtime.ts";

class Repository implements OperationRepository {
	readonly record: OperationRecord = {
		id: "operation-1",
		guildId: null,
		kind: "smoke",
		idempotencyKey: "request-1",
		payload: {},
		status: "pending",
		leaseUntil: null,
		claimVersion: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	async create() {
		return { record: this.record, created: true };
	}
	async get() {
		return this.record;
	}
	settlementFails = false;
	recoverable: OperationRecord[] | undefined;

	async claim() {
		if (this.record.status === "completed" || this.record.status === "failed")
			return { state: "terminal" as const };
		if (this.record.status === "processing") return { state: "busy" as const };
		this.record.status = "processing";
		this.record.leaseUntil = new Date(Date.now() + 30_000);
		this.record.claimVersion++;
		return { state: "claimed" as const, record: { ...this.record } };
	}
	async complete(_id: string, claimVersion: number) {
		if (this.settlementFails) throw new Error("settlement unavailable");
		if (this.record.claimVersion !== claimVersion) return false;
		this.record.status = "completed";
		return true;
	}
	async fail(_id: string, claimVersion: number, failure: OperationFailure) {
		if (this.settlementFails) throw new Error("settlement unavailable");
		if (this.record.claimVersion !== claimVersion) return false;
		this.record.status = failure.classification === "retryable" ? "retryable" : "failed";
		return true;
	}
	async listRecoverable() {
		return this.recoverable ?? [this.record];
	}
	async recordEffect() {
		return true;
	}
}

test("retryable failures remain durable and cause queue retry", async () => {
	const repository = new Repository();
	const processor = createOperationProcessor(
		repository,
		new Map([
			[
				"smoke",
				async () => {
					throw new RetryableOperationError("busy");
				},
			],
		]),
	);
	await assert.rejects(
		processor({ data: { version: 1, operationId: "operation-1" } } as never),
		/retryable_operation_failure/,
	);
	assert.equal(repository.record.status, "retryable");
});

test("a retry before an unsettled lease expires stays retryable instead of looking terminal", async () => {
	const repository = new Repository();
	repository.settlementFails = true;
	const processor = createOperationProcessor(repository, new Map([["smoke", async () => {}]]));
	await assert.rejects(
		processor({ data: { version: 1, operationId: "operation-1" } } as never),
		/settlement unavailable/,
	);
	assert.equal(repository.record.status, "processing");
	repository.settlementFails = false;
	await assert.rejects(
		processor({ data: { version: 1, operationId: "operation-1" } } as never),
		/operation_busy/,
	);
	assert.equal(repository.record.status, "processing");
});

test("reconciler republishes every recoverable operation", async () => {
	const repository = new Repository();
	repository.recoverable = [
		{ ...repository.record, id: "pending", status: "pending" },
		{ ...repository.record, id: "retryable", status: "retryable" },
		{
			...repository.record,
			id: "expired",
			status: "processing",
			leaseUntil: new Date(0),
		},
	];
	const published: string[] = [];
	const reconciler = new OperationReconciler(repository, {
		async publish(payload) {
			published.push(payload.operationId);
		},
	});
	assert.equal(await reconciler.runOnce(), 3);
	assert.deepEqual(published, ["pending", "retryable", "expired"]);
});

test("one reconciliation publish failure does not skip later durable records", async () => {
	const repository = new Repository();
	repository.recoverable = [
		{ ...repository.record, id: "first" },
		{ ...repository.record, id: "second" },
	];
	const published: string[] = [];
	const reconciler = new OperationReconciler(repository, {
		async publish(payload) {
			published.push(payload.operationId);
			if (payload.operationId === "first") throw new Error("redis unavailable");
		},
	});
	await assert.rejects(reconciler.runOnce(), AggregateError);
	assert.deepEqual(published, ["first", "second"]);
});

test("permanently malformed queue payloads do not cause queue retries", async () => {
	const repository = new Repository();
	const processor = createOperationProcessor(repository, new Map());
	await processor({ data: { version: 2, operationId: "operation-1" } } as never);
	assert.equal(repository.record.status, "pending");
});

test("tracked worker drain waits for every handle and clears the registry", async () => {
	const tracked = new TrackedWorkers();
	const closed: string[] = [];
	tracked.track({
		async close() {
			await Promise.resolve();
			closed.push("first");
		},
	});
	tracked.track({
		async close() {
			await Promise.resolve();
			closed.push("second");
		},
	});
	assert.equal(tracked.size, 2);
	await tracked.drain();
	assert.deepEqual(closed.sort(), ["first", "second"]);
	assert.equal(tracked.size, 0);
});

test("tracked drain still closes every handle when one close fails", async () => {
	const tracked = new TrackedWorkers();
	let secondClosed = false;
	tracked.track({
		async close() {
			throw new Error("first failed");
		},
	});
	tracked.track({
		async close() {
			secondClosed = true;
		},
	});
	await assert.rejects(tracked.drain(), AggregateError);
	assert.equal(secondClosed, true);
	assert.equal(tracked.size, 0);
});

test("runtime and database cleanup continue after one worker close fails", async () => {
	const tracked = new TrackedWorkers();
	let secondClosed = false;
	tracked.track({
		async close() {
			throw new Error("first failed");
		},
	});
	tracked.track({
		async close() {
			secondClosed = true;
		},
	});
	let redisDisconnected = false;
	const runtime = new WorkerRuntime(
		{
			disconnect() {
				redisDisconnected = true;
			},
		} as never,
		tracked,
	);
	let databaseDisconnected = false;
	const logged: unknown[] = [];
	const failed = await drainRuntimeAndDatabase(
		runtime,
		async () => {
			databaseDisconnected = true;
		},
		(error) => logged.push(error),
	);
	assert.equal(failed, true);
	assert.equal(secondClosed, true);
	assert.equal(redisDisconnected, true);
	assert.equal(databaseDisconnected, true);
	assert.equal(logged[0] instanceof AggregateError, true);
});
