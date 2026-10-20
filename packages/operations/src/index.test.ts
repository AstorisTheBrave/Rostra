import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyOperationError,
	createAndRelayOperation,
	IdempotencyConflictError,
	type NewOperation,
	type OperationFailure,
	type OperationHandler,
	type OperationRecord,
	type OperationRepository,
	operationJobId,
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
	readonly published = new Set<string>();
	#sequence = 0;

	async create(input: NewOperation) {
		const existingId = this.keys.get(input.idempotencyKey);
		if (existingId) {
			const existing = this.records.get(existingId) as OperationRecord;
			if (existing.kind !== input.kind || existing.guildId !== (input.guildId ?? null))
				throw new IdempotencyConflictError();
			return { record: existing, created: false };
		}
		const now = new Date();
		const record: OperationRecord = {
			id: `operation-${++this.#sequence}`,
			guildId: input.guildId ?? null,
			kind: input.kind,
			idempotencyKey: input.idempotencyKey,
			payload: input.payload ?? {},
			status: "pending",
			leaseUntil: null,
			claimVersion: 0,
			createdAt: now,
			updatedAt: now,
		};
		this.records.set(record.id, record);
		this.keys.set(record.idempotencyKey, record.id);
		return { record, created: true };
	}

	async claimOutbox(id: string) {
		return this.published.has(id) ? undefined : { operationId: id, claimVersion: 1, attempts: 1 };
	}
	async claimDueOutbox() {
		return [];
	}
	async publishOutbox(id: string) {
		this.published.add(id);
		return true;
	}
	async retryOutbox() {
		return true;
	}

	async get(id: string) {
		return this.records.get(id);
	}

	async claim(id: string, now: Date, leaseMs: number) {
		const record = this.records.get(id);
		if (!record) return { state: "missing" as const };
		if (record.status === "completed" || record.status === "failed")
			return { state: "terminal" as const };
		if (record.status === "processing" && (!record.leaseUntil || record.leaseUntil >= now))
			return { state: "busy" as const };
		record.status = "processing";
		record.leaseUntil = new Date(now.getTime() + leaseMs);
		record.claimVersion++;
		return { state: "claimed" as const, record: { ...record } };
	}

	async complete(id: string, claimVersion: number) {
		const record = this.records.get(id);
		if (record?.status !== "processing" || record.claimVersion !== claimVersion) return false;
		record.status = "completed";
		record.leaseUntil = null;
		return true;
	}

	async fail(id: string, claimVersion: number, failure: OperationFailure) {
		const record = this.records.get(id);
		if (record?.status !== "processing" || record.claimVersion !== claimVersion) return false;
		this.failures.push(failure);
		record.status = failure.classification === "retryable" ? "retryable" : "failed";
		record.leaseUntil = null;
		return true;
	}

	async listRecoverable(now: Date, limit: number) {
		return [...this.records.values()]
			.filter(
				(record) =>
					record.status === "pending" ||
					record.status === "retryable" ||
					(record.status === "processing" && record.leaseUntil !== null && record.leaseUntil < now),
			)
			.slice(0, limit);
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
	const first = await createAndRelayOperation(repository, publisher, input);
	const second = await createAndRelayOperation(repository, publisher, input);
	assert.equal(first.record.id, second.record.id);
	assert.deepEqual(order, ["publish"]);
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
	assert.equal(await processOperation(repository, handlers, payload), "terminal");
	assert.equal(effects, 1);
});

test("idempotency keys reject mismatched operation kind or guild ownership", async () => {
	const repository = new MemoryRepository();
	await repository.create({ kind: "smoke", guildId: "guild-1", idempotencyKey: "request-1" });
	await assert.rejects(
		repository.create({ kind: "other", guildId: "guild-1", idempotencyKey: "request-1" }),
		IdempotencyConflictError,
	);
	await assert.rejects(
		repository.create({ kind: "smoke", guildId: "guild-2", idempotencyKey: "request-1" }),
		IdempotencyConflictError,
	);
});

test("claim fencing prevents a stale worker from settling after lease takeover", async () => {
	const repository = new MemoryRepository();
	const { record } = await repository.create({ kind: "smoke", idempotencyKey: "request-1" });
	const first = await repository.claim(record.id, new Date(0), 1);
	const second = await repository.claim(record.id, new Date(2), 1);
	assert.equal(first.state, "claimed");
	assert.equal(second.state, "claimed");
	if (first.state !== "claimed" || second.state !== "claimed") return;
	assert.equal(await repository.complete(record.id, second.record.claimVersion), true);
	assert.equal(
		await repository.fail(record.id, first.record.claimVersion, {
			classification: "retryable",
			code: "late_failure",
		}),
		false,
	);
	assert.equal(repository.records.get(record.id)?.status, "completed");
});

test("operation queue job ids are deterministic", () => {
	assert.equal(operationJobId("operation-1"), "operation-operation-1");
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
