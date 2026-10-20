import { isDeepStrictEqual } from "node:util";
import { getPrisma, type Prisma } from "@rostra/database";
import type { NewOperation, OperationPublisher, OperationRecord } from "./index.ts";

export class IdempotencyConflictError extends Error {
	readonly code = "idempotency_conflict";
}

export interface OperationOutboxClaim {
	operationId: string;
	claimVersion: number;
	attempts: number;
}

export interface OperationOutboxRepository {
	claimOutbox(id: string, now: Date, leaseMs: number): Promise<OperationOutboxClaim | undefined>;
	claimDueOutbox(now: Date, limit: number, leaseMs: number): Promise<OperationOutboxClaim[]>;
	publishOutbox(id: string, claimVersion: number, now: Date): Promise<boolean>;
	retryOutbox(id: string, claimVersion: number, now: Date): Promise<boolean>;
}

export async function createOperationWithOutbox(
	input: NewOperation,
	mutate?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<{ record: OperationRecord; created: boolean }> {
	return getPrisma().$transaction(async (tx) => {
		const inserted = await tx.operationRecord.createMany({
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
		const existing = await tx.operationRecord.findUniqueOrThrow({
			where: { idempotencyKey: input.idempotencyKey },
		});
		if (
			existing.kind !== input.kind ||
			existing.guildId !== (input.guildId ?? null) ||
			!isDeepStrictEqual(existing.payload, input.payload ?? {})
		)
			throw new IdempotencyConflictError();
		if (inserted.count === 1) {
			await mutate?.(tx);
			await tx.operationOutbox.create({ data: { operationId: existing.id } });
		}
		return {
			record: { ...existing, status: existing.status as OperationRecord["status"] },
			created: inserted.count === 1,
		};
	});
}

export async function claimOutboxRow(
	id: string,
	now: Date,
	leaseMs: number,
): Promise<OperationOutboxClaim | undefined> {
	return getPrisma().$transaction(async (tx) => {
		const updated = await tx.operationOutbox.updateMany({
			where: {
				operationId: id,
				OR: [
					{ status: "pending", nextAttemptAt: { lte: now } },
					{ status: "retryable", nextAttemptAt: { lte: now } },
					{ status: "claimed", leaseUntil: { lt: now } },
				],
			},
			data: {
				status: "claimed",
				leaseUntil: new Date(now.getTime() + leaseMs),
				claimVersion: { increment: 1 },
				attempts: { increment: 1 },
			},
		});
		if (updated.count === 0) return undefined;
		const row = await tx.operationOutbox.findUniqueOrThrow({ where: { operationId: id } });
		return { operationId: row.operationId, claimVersion: row.claimVersion, attempts: row.attempts };
	});
}

export async function claimDueOutboxRows(
	now: Date,
	limit: number,
	leaseMs: number,
): Promise<OperationOutboxClaim[]> {
	await repairMissingOutboxRows(Math.min(Math.max(limit, 0), 20), now);
	const rows = await getPrisma().operationOutbox.findMany({
		where: {
			OR: [
				{ status: "pending", nextAttemptAt: { lte: now } },
				{ status: "retryable", nextAttemptAt: { lte: now } },
				{ status: "claimed", leaseUntil: { lt: now } },
			],
		},
		orderBy: { createdAt: "asc" },
		take: Math.min(Math.max(limit, 0), 20),
		select: { operationId: true },
	});
	const claims = await Promise.all(
		rows.map((row) => claimOutboxRow(row.operationId, now, leaseMs)),
	);
	return claims.filter((claim): claim is OperationOutboxClaim => claim !== undefined);
}

export async function repairMissingOutboxRows(limit: number, now: Date): Promise<number> {
	const repaired = await getPrisma().$queryRaw<{ operationId: string }[]>`
		INSERT INTO "OperationOutbox" ("operationId", "nextAttemptAt")
		SELECT operation.id, ${now}
		FROM "OperationRecord" AS operation
		LEFT JOIN "OperationOutbox" AS outbox ON outbox."operationId" = operation.id
		WHERE operation.status IN ('pending', 'retryable', 'processing')
			AND outbox."operationId" IS NULL
		ORDER BY operation."createdAt", operation.id
		LIMIT ${Math.min(Math.max(limit, 0), 20)}
		ON CONFLICT ("operationId") DO NOTHING
		RETURNING "operationId"
	`;
	return repaired.length;
}

export async function settlePublishedOutbox(
	id: string,
	claimVersion: number,
	now: Date,
): Promise<boolean> {
	const result = await getPrisma().operationOutbox.updateMany({
		where: { operationId: id, status: "claimed", claimVersion },
		data: { status: "published", leaseUntil: null, publishedAt: now, lastErrorCode: null },
	});
	return result.count === 1;
}

export async function retryClaimedOutbox(
	id: string,
	claimVersion: number,
	now: Date,
): Promise<boolean> {
	return getPrisma().$transaction(async (tx) => {
		const row = await tx.operationOutbox.findUnique({ where: { operationId: id } });
		if (row?.status !== "claimed" || row.claimVersion !== claimVersion) return false;
		const delayMs = Math.min(300_000, 5_000 * 2 ** Math.min(row.attempts - 1, 6));
		const result = await tx.operationOutbox.updateMany({
			where: { operationId: id, status: "claimed", claimVersion },
			data: {
				status: "retryable",
				leaseUntil: null,
				nextAttemptAt: new Date(now.getTime() + delayMs),
				lastErrorCode: "publish_failed",
			},
		});
		return result.count === 1;
	});
}

export async function publishClaimedOutbox(
	repository: OperationOutboxRepository,
	publisher: OperationPublisher,
	claim: OperationOutboxClaim,
): Promise<boolean> {
	try {
		await publisher.publish({ version: 1, operationId: claim.operationId });
	} catch {
		await repository.retryOutbox(claim.operationId, claim.claimVersion, new Date());
		return false;
	}
	return repository.publishOutbox(claim.operationId, claim.claimVersion, new Date());
}

export async function relayOperation(
	repository: OperationOutboxRepository,
	publisher: OperationPublisher,
	id: string,
): Promise<"published" | "degraded" | "busy"> {
	const claim = await repository.claimOutbox(id, new Date(), 30_000);
	if (!claim) return "busy";
	return (await publishClaimedOutbox(repository, publisher, claim)) ? "published" : "degraded";
}
