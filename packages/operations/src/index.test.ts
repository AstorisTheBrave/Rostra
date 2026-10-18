import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyOperationError,
	createAndPublishOperation,
	type NewOperation,
	type OperationFailure,
	type OperationHandler,
	type OperationRecord,
	type OperationRepository,
	PermanentOperationError,
	parseOperationQueuePayload,
	processOperation,
	RetryableOperationError,
} from "./index.ts";

class MemoryRepository implements OperationRepository {
	readonly records = new Map<string, OperationRecord>();
	readonly keys = new Map<string, string>();
	readonly failures: OperationFailure[] = [];
	readonly effects = new Set<string>();
	#sequence = 0;

	async create(input: NewOperation) {
		const existingId = this.keys.get(input.idempotencyKey);
		if (existingId)
			return { record: this.records.get(existingId) as OperationRecord, created: false };
		const now = new Date();
		const record: OperationRecord = {
			id: `operation-${++this.#sequence}`,
			guildId: input.guildId ?? null,
			kind: input.kind,
			idempotencyKey: input.idempotencyKey,
			payload: input.payload ?? {},
			status: "pending",
			leaseUntil: null,
			createdAt: now,
			updatedAt: now,
		};
		this.records.set(record.id, record);
		this.keys.set(record.idempotencyKey, record.id);
		return { record, created: true };
	}

	async get(id: string) {
		return this.records.get(id);
	}

	async claim(id: string) {
		const record = this.records.get(id);
		if (!record || !["pending", "retryable"].includes(record.status)) return undefined;
		record.status = "processing";
		return record;
	}

	async complete(id: string) {
		const record = this.records.get(id);
		if (record) record.status = "completed";
	}

	async fail(id: string, failure: OperationFailure) {
		this.failures.push(failure);
		const record = this.records.get(id);
		if (record) record.status = failure.classification === "retryable" ? "retryable" : "failed";
	}

	async recordEffect(id: string, _value: unknown) {
		if (this.effects.has(id)) return false;
		this.effects.add(id);
		return true;
	}
}

test("durable intent is created before delivery and idempotency avoids duplicate delivery", async () => {
	const repository = new MemoryRepository();
	const order: string[] = [];
	const publisher = {
		async publish() {
			assert.equal(repository.records.size, 1);
			order.push("publish");
		},
	};
	const input = { kind: "smoke", guildId: "guild-1", idempotencyKey: "request-1" };
	const first = await createAndPublishOperation(repository, publisher, input);
	const second = await createAndPublishOperation(repository, publisher, input);
	assert.equal(first.id, second.id);
	assert.deepEqual(order, ["publish", "publish"]);
});

test("queue payload validation rejects malformed delivery without exposing internals", () => {
	assert.deepEqual(parseOperationQueuePayload({ version: 1, operationId: "operation-1" }), {
		version: 1,
		operationId: "operation-1",
	});
	assert.throws(
		() => parseOperationQueuePayload({ version: 2, operationId: "operation-1" }),
		(error: unknown) =>
			error instanceof PermanentOperationError && error.code === "invalid_queue_payload",
	);
});

test("duplicate delivery applies one operation effect", async () => {
	const repository = new MemoryRepository();
	const { record } = await repository.create({ kind: "smoke", idempotencyKey: "request-1" });
	let effects = 0;
	const handlers = new Map<string, OperationHandler>([
		[
			"smoke",
			async (operation) => {
				if (await repository.recordEffect(operation.id, {})) effects++;
			},
		],
	]);
	const payload = { version: 1 as const, operationId: record.id };
	assert.equal(await processOperation(repository, handlers, payload), "completed");
	assert.equal(await processOperation(repository, handlers, payload), "duplicate");
	assert.equal(effects, 1);
});

test("unknown handlers stay retryable instead of being discarded", async () => {
	const repository = new MemoryRepository();
	const { record } = await repository.create({ kind: "missing", idempotencyKey: "request-1" });
	assert.equal(
		await processOperation(repository, new Map(), { version: 1, operationId: record.id }),
		"retryable",
	);
	assert.equal(repository.records.get(record.id)?.status, "retryable");
	assert.deepEqual(repository.failures, [{ classification: "retryable", code: "unknown_handler" }]);
});

test("operation failures distinguish retryable and permanent errors", () => {
	assert.deepEqual(classifyOperationError(new RetryableOperationError("upstream_busy")), {
		classification: "retryable",
		code: "upstream_busy",
	});
	assert.deepEqual(classifyOperationError(new PermanentOperationError("invalid_request")), {
		classification: "permanent",
		code: "invalid_request",
	});
	assert.deepEqual(classifyOperationError(new Error("secret detail")), {
		classification: "retryable",
		code: "unhandled_error",
	});
});

test("permanent handler failure is persisted and is not retried", async () => {
	const repository = new MemoryRepository();
	const { record } = await repository.create({ kind: "invalid", idempotencyKey: "request-1" });
	const outcome = await processOperation(
		repository,
		new Map([
			[
				"invalid",
				async () => {
					throw new PermanentOperationError("invalid_request");
				},
			],
		]),
		{ version: 1, operationId: record.id },
	);
	assert.equal(outcome, "permanent");
	assert.equal(repository.records.get(record.id)?.status, "failed");
});
