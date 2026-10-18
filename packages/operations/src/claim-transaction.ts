import { getPrisma } from "@rostra/database";

export interface ClaimedOperationRow {
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

export async function claimOperationRow(
	id: string,
	now: Date,
	leaseMs: number,
	afterUpdate?: () => Promise<void>,
): Promise<ClaimedOperationRow | undefined> {
	return getPrisma().$transaction(async (tx) => {
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
		await afterUpdate?.();
		return tx.operationRecord.findUniqueOrThrow({ where: { id } });
	});
}
