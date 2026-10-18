import { getPrisma } from "@rostra/database";

interface ClaimedOperationRow {
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
}

interface ClaimTransactionTestHooks {
	beforeUpdate?(backendPid: number): Promise<void>;
	afterUpdate?(): Promise<void>;
}

async function runClaimOperationRow(
	id: string,
	now: Date,
	leaseMs: number,
	testHooks?: ClaimTransactionTestHooks,
): Promise<ClaimedOperationRow | undefined> {
	return getPrisma().$transaction(async (tx) => {
		if (testHooks?.beforeUpdate) {
			const [backend] = await tx.$queryRaw<[{ backendPid: number }]>`
				SELECT pg_backend_pid()::integer AS "backendPid"
			`;
			await testHooks.beforeUpdate(backend.backendPid);
		}
		const claimed = await tx.operationRecord.updateMany({
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
		if (claimed.count === 0) return undefined;
		await testHooks?.afterUpdate?.();
		return tx.operationRecord.findUniqueOrThrow({ where: { id } });
	});
}

export async function claimOperationRow(
	id: string,
	now: Date,
	leaseMs: number,
): Promise<ClaimedOperationRow | undefined> {
	return runClaimOperationRow(id, now, leaseMs);
}

export async function claimOperationRowForTest(
	id: string,
	now: Date,
	leaseMs: number,
	testHooks: ClaimTransactionTestHooks,
): Promise<ClaimedOperationRow | undefined> {
	return runClaimOperationRow(id, now, leaseMs, testHooks);
}
