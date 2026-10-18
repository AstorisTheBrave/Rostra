import type { Prisma } from "@rostra/database";
import { getPrisma } from "@rostra/database";
import { type ConnectionOptions, Queue } from "bullmq";

export type OperationStatus = "pending" | "processing" | "retryable" | "completed" | "failed";
export type FailureClassification = "retryable" | "permanent";

export interface OperationRecord {
	id: string;
	guildId: string | null;
	kind: string;
	idempotencyKey: string;
	payload: unknown;
	status: OperationStatus;
	leaseUntil: Date | null;
	claimVersion: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface OperationAttempt {
	id: string;
	operationId: string;
	attempt: number;
	outcome: "completed" | "failed";
	classification: FailureClassification | null;
	errorCode: string | null;
	createdAt: Date;
}

export interface DomainEventEnvelope<T = unknown> {
	version: 1;
	eventId: string;
	operationId: string;
	guildId: string | null;
	type: string;
	payload: T;
	occurredAt: string;
}

export interface OperationQueuePayload {
	version: 1;
	operationId: string;
}

export function parseOperationQueuePayload(value: unknown): OperationQueuePayload {
	if (
		typeof value !== "object" ||
		value === null ||
		!("version" in value) ||
		value.version !== 1 ||
		!("operationId" in value) ||
		typeof value.operationId !== "string" ||
		value.operationId.length === 0
	)
		throw new PermanentOperationError("invalid_queue_payload");
	return { version: 1, operationId: value.operationId };
}

export interface NewOperation {
	guildId?: string | null;
	kind: string;
	idempotencyKey: string;
	payload?: unknown;
}

export interface OperationFailure {
	classification: FailureClassification;
	code: string;
}

export interface OperationRepository {
	create(input: NewOperation): Promise<{ record: OperationRecord; created: boolean }>;
	get(id: string): Promise<OperationRecord | undefined>;
	claim(id: string, now: Date, leaseMs: number): Promise<OperationClaim>;
	complete(id: string, claimVersion: number): Promise<boolean>;
	fail(id: string, claimVersion: number, failure: OperationFailure): Promise<boolean>;
	listRecoverable(now: Date, limit: number): Promise<OperationRecord[]>;
	recordEffect(id: string, value: unknown): Promise<boolean>;
}

export type OperationClaim =
	| { state: "claimed"; record: OperationRecord }
	| { state: "busy" | "missing" | "terminal" };

export interface OperationPublisher {
	publish(payload: OperationQueuePayload): Promise<void>;
}

export type OperationHandler = (operation: OperationRecord) => Promise<void>;

export class PermanentOperationError extends Error {
	constructor(
		readonly code: string,
		message = code,
	) {
		super(message);
	}
}

export class RetryableOperationError extends Error {
	constructor(
		readonly code: string,
		message = code,
	) {
		super(message);
	}
}

export class IdempotencyConflictError extends Error {
	readonly code = "idempotency_conflict";
}

export function classifyOperationError(error: unknown): OperationFailure {
	if (error instanceof PermanentOperationError)
		return { classification: "permanent", code: error.code };
	if (error instanceof RetryableOperationError)
		return { classification: "retryable", code: error.code };
	return { classification: "retryable", code: "unhandled_error" };
}

export async function createAndPublishOperation(
	repository: OperationRepository,
	publisher: OperationPublisher,
	input: NewOperation,
): Promise<OperationRecord> {
	const result = await repository.create(input);
	if (!["completed", "failed"].includes(result.record.status))
		await publisher.publish({ version: 1, operationId: result.record.id });
	return result.record;
}

export async function processOperation(
	repository: OperationRepository,
	handlers: ReadonlyMap<string, OperationHandler>,
	payload: OperationQueuePayload,
	options: { now?: Date; leaseMs?: number } = {},
): Promise<"completed" | "terminal" | "busy" | "stale" | FailureClassification> {
	if (payload.version !== 1) throw new PermanentOperationError("unsupported_payload_version");
	const claim = await repository.claim(
		payload.operationId,
		options.now ?? new Date(),
		options.leaseMs ?? 30_000,
	);
	if (claim.state === "busy") return "busy";
	if (claim.state !== "claimed") return "terminal";
	const operation = claim.record;
	const handler = handlers.get(operation.kind);
	if (!handler) {
		const current = await repository.fail(operation.id, operation.claimVersion, {
			classification: "retryable",
			code: "unknown_handler",
		});
		return current ? "retryable" : "stale";
	}
	try {
		await handler(operation);
		return (await repository.complete(operation.id, operation.claimVersion))
			? "completed"
			: "stale";
	} catch (error) {
		const failure = classifyOperationError(error);
		return (await repository.fail(operation.id, operation.claimVersion, failure))
			? failure.classification
			: "stale";
	}
}

export function operationJobId(operationId: string): string {
	return `operation-${operationId}`;
}

export class BullMqOperationPublisher implements OperationPublisher {
	readonly #queue: Queue<OperationQueuePayload>;

	constructor(connection: ConnectionOptions) {
		this.#queue = new Queue<OperationQueuePayload>("operations", { connection });
	}

	async publish(payload: OperationQueuePayload): Promise<void> {
		const jobId = operationJobId(payload.operationId);
		const existing = await this.#queue.getJob(jobId);
		if (existing) {
			const state = await existing.getState();
			if (state === "failed" || state === "completed") await existing.retry(state);
			return;
		}
		await this.#queue.add("operation", payload, {
			jobId,
			attempts: 5,
			backoff: { type: "exponential", delay: 1_000 },
			removeOnComplete: 1_000,
			removeOnFail: false,
		});
	}

	async close(): Promise<void> {
		await this.#queue.close();
	}
}

function record(row: {
	id: string;
	guildId: string | null;
	kind: string;
	idempotencyKey: string;
	payload: unknown;
	status: string;
	leaseUntil: Date | null;
	claimVersion: number;
	createdAt: Date;
	updatedAt: Date;
}): OperationRecord {
	return { ...row, status: row.status as OperationStatus };
}

export class PrismaOperationRepository implements OperationRepository {
	async create(input: NewOperation): Promise<{ record: OperationRecord; created: boolean }> {
		const prisma = getPrisma();
		const inserted = await prisma.operationRecord.createMany({
			data: [
				{
					guildId: input.guildId ?? null,
					kind: input.kind,
					idempotencyKey: input.idempotencyKey,
					payload: (input.payload ?? {}) as Prisma.InputJsonValue,
				},
			],
			skipDuplicates: true,
		});
		const existing = await prisma.operationRecord.findUniqueOrThrow({
			where: { idempotencyKey: input.idempotencyKey },
		});
		if (existing.kind !== input.kind || existing.guildId !== (input.guildId ?? null))
			throw new IdempotencyConflictError();
		return { record: record(existing), created: inserted.count === 1 };
	}

	async get(id: string): Promise<OperationRecord | undefined> {
		const row = await getPrisma().operationRecord.findUnique({ where: { id } });
		return row ? record(row) : undefined;
	}

	async claim(id: string, now: Date, leaseMs: number): Promise<OperationClaim> {
		const prisma = getPrisma();
		const claimed = await prisma.operationRecord.updateMany({
			where: {
				id,
				OR: [
					{ status: "pending" },
					{ status: "retryable" },
					{ status: "processing", leaseUntil: { lt: now } },
				],
			},
			data: {
				status: "processing",
				leaseUntil: new Date(now.getTime() + leaseMs),
				claimVersion: { increment: 1 },
			},
		});
		if (claimed.count === 0) {
			const existing = await prisma.operationRecord.findUnique({ where: { id } });
			if (!existing) return { state: "missing" };
			if (existing.status === "completed" || existing.status === "failed")
				return { state: "terminal" };
			return { state: "busy" };
		}
		const row = await prisma.operationRecord.findUniqueOrThrow({ where: { id } });
		return { state: "claimed", record: record(row) };
	}

	async complete(id: string, claimVersion: number): Promise<boolean> {
		return this.finish(id, claimVersion, "completed", null);
	}

	async fail(id: string, claimVersion: number, failure: OperationFailure): Promise<boolean> {
		return this.finish(
			id,
			claimVersion,
			failure.classification === "retryable" ? "retryable" : "failed",
			failure,
		);
	}

	private async finish(
		id: string,
		claimVersion: number,
		status: OperationStatus,
		failure: OperationFailure | null,
	): Promise<boolean> {
		const prisma = getPrisma();
		return prisma.$transaction(async (tx) => {
			const settled = await tx.operationRecord.updateMany({
				where: { id, status: "processing", claimVersion },
				data: { status, leaseUntil: null },
			});
			if (settled.count === 0) return false;
			const attempt = await tx.operationAttempt.count({ where: { operationId: id } });
			await tx.operationAttempt.create({
				data: {
					operationId: id,
					attempt: attempt + 1,
					outcome: failure ? "failed" : "completed",
					classification: failure?.classification ?? null,
					errorCode: failure?.code ?? null,
				},
			});
			return true;
		});
	}

	async listRecoverable(now: Date, limit: number): Promise<OperationRecord[]> {
		const rows = await getPrisma().operationRecord.findMany({
			where: {
				OR: [
					{ status: "pending" },
					{ status: "retryable" },
					{ status: "processing", leaseUntil: { lt: now } },
				],
			},
			orderBy: { createdAt: "asc" },
			take: limit,
		});
		return rows.map(record);
	}

	async recordEffect(id: string, value: unknown): Promise<boolean> {
		const result = await getPrisma().operationEffect.createMany({
			data: [{ operationId: id, value: value as Prisma.InputJsonValue }],
			skipDuplicates: true,
		});
		return result.count === 1;
	}
}
