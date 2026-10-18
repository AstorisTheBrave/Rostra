import assert from "node:assert/strict";
import { test } from "node:test";
import type { OperationFailure, OperationRecord, OperationRepository } from "@rostra/operations";
import { RetryableOperationError } from "@rostra/operations";
import { createOperationProcessor, TrackedWorkers } from "./runtime.ts";

class Repository implements OperationRepository {
	readonly record: OperationRecord = {
		id: "operation-1",
		guildId: null,
		kind: "smoke",
		idempotencyKey: "request-1",
		payload: {},
		status: "pending",
		leaseUntil: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	async create() {
		return { record: this.record, created: true };
	}
	async get() {
		return this.record;
	}
	async claim() {
		if (this.record.status === "completed" || this.record.status === "processing") return undefined;
		this.record.status = "processing";
		return this.record;
	}
	async complete() {
		this.record.status = "completed";
	}
	async fail(_id: string, failure: OperationFailure) {
		this.record.status = failure.classification === "retryable" ? "retryable" : "failed";
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
