import type { Prisma } from "@rostra/database";
import { getPrisma } from "@rostra/database";

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
	claim(id: string, now: Date, leaseMs: number): Promise<OperationRecord | undefined>;
	complete(id: string): Promise<void>;
	fail(id: string, failure: OperationFailure): Promise<void>;
	recordEffect(id: string, value: unknown): Promise<boolean>;
}

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
): Promise<"completed" | "duplicate" | FailureClassification> {
	if (payload.version !== 1) throw new PermanentOperationError("unsupported_payload_version");
	const operation = await repository.claim(
		payload.operationId,
		options.now ?? new Date(),
		options.leaseMs ?? 30_000,
	);
	if (!operation) return "duplicate";
	const handler = handlers.get(operation.kind);
	if (!handler) {
		await repository.fail(operation.id, {
			classification: "retryable",
			code: "unknown_handler",
		});
		return "retryable";
	}
	try {
		await handler(operation);
		await repository.complete(operation.id);
		return "completed";
	} catch (error) {
		const failure = classifyOperationError(error);
		await repository.fail(operation.id, failure);
		return failure.classification;
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
	createdAt: Date;
	updatedAt: Date;
}): OperationRecord {
	return { ...row, status: row.status as OperationStatus };
}

function isUniqueConstraint(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export class PrismaOperationRepository implements OperationRepository {
	async create(input: NewOperation): Promise<{ record: OperationRecord; created: boolean }> {
		const prisma = getPrisma();
		try {
			const created = await prisma.operationRecord.create({
				data: {
					guildId: input.guildId ?? null,
					kind: input.kind,
					idempotencyKey: input.idempotencyKey,
					payload: (input.payload ?? {}) as Prisma.InputJsonValue,
				},
			});
			return { record: record(created), created: true };
		} catch (error) {
			if (!isUniqueConstraint(error)) throw error;
			const existing = await prisma.operationRecord.findUniqueOrThrow({
				where: { idempotencyKey: input.idempotencyKey },
			});
			return { record: record(existing), created: false };
		}
	}

	async get(id: string): Promise<OperationRecord | undefined> {
		const row = await getPrisma().operationRecord.findUnique({ where: { id } });
		return row ? record(row) : undefined;
	}

	async claim(id: string, now: Date, leaseMs: number): Promise<OperationRecord | undefined> {
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
			data: { status: "processing", leaseUntil: new Date(now.getTime() + leaseMs) },
		});
		if (claimed.count === 0) return undefined;
		const row = await prisma.operationRecord.findUniqueOrThrow({ where: { id } });
		return record(row);
	}

	async complete(id: string): Promise<void> {
		await this.finish(id, "completed", null);
	}

	async fail(id: string, failure: OperationFailure): Promise<void> {
		await this.finish(id, failure.classification === "retryable" ? "retryable" : "failed", failure);
	}

	private async finish(
		id: string,
		status: OperationStatus,
		failure: OperationFailure | null,
	): Promise<void> {
		const prisma = getPrisma();
		await prisma.$transaction(async (tx) => {
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
			await tx.operationRecord.update({ where: { id }, data: { status, leaseUntil: null } });
		});
	}

	async recordEffect(id: string, value: unknown): Promise<boolean> {
		const result = await getPrisma().operationEffect.createMany({
			data: [{ operationId: id, value: value as Prisma.InputJsonValue }],
			skipDuplicates: true,
		});
		return result.count === 1;
	}
}
