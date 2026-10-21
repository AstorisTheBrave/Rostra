import type { Prisma, ScheduledTask } from "@rostra/database";
import { getPrisma } from "@rostra/database";

export const SCHEDULED_TASK_CHANNEL = "scheduled-task-dispatch";
export const SCHEDULED_TASK_LEASE_MS = 30_000;
export const SCHEDULED_TASK_MAX_ATTEMPTS = 8;

export interface ScheduledTaskDispatchV1 {
	version: 1;
	taskId: string;
	claimVersion: number;
}

export function parseScheduledTaskDispatch(value: unknown): ScheduledTaskDispatchV1 | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const message = value as Record<string, unknown>;
	if (
		Object.keys(message).length !== 3 ||
		message.version !== 1 ||
		typeof message.taskId !== "string" ||
		!/^[A-Za-z0-9_-]{1,128}$/.test(message.taskId) ||
		!Number.isSafeInteger(message.claimVersion) ||
		(message.claimVersion as number) < 1
	)
		return null;
	return message as unknown as ScheduledTaskDispatchV1;
}

export class PermanentScheduledTaskError extends Error {
	constructor() {
		super("invalid_payload");
	}
}

export function requireTaskPayload<const K extends string>(
	payload: unknown,
	keys: readonly K[],
): Record<K, string> {
	if (!payload || typeof payload !== "object" || Array.isArray(payload))
		throw new PermanentScheduledTaskError();
	const data = payload as Record<string, unknown>;
	for (const key of keys)
		if (typeof data[key] !== "string" || !/^[0-9]{1,32}$/.test(data[key]))
			throw new PermanentScheduledTaskError();
	return data as Record<K, string>;
}

export function scheduledRetryAt(attempts: number, now: Date): Date {
	return new Date(
		now.getTime() + Math.min(300_000, 5_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6)),
	);
}

export type ScheduledFailureCode =
	| "invalid_payload"
	| "unknown_handler"
	| "handler_failed"
	| "publish_failed";

export interface ScheduledTaskRepository {
	schedule(input: {
		type: string;
		runAt: Date;
		guildId?: string | null;
		payload?: Prisma.InputJsonValue;
	}): Promise<ScheduledTask>;
	cancel(id: string): Promise<"cancelled" | "processing" | "terminal" | "missing">;
	claimDue(now: Date, limit: number, leaseMs: number): Promise<ScheduledTask[]>;
	getClaim(id: string, claimVersion: number, now: Date): Promise<ScheduledTask | null>;
	accept(id: string, claimVersion: number, now: Date): Promise<boolean>;
	deferPublication(id: string, claimVersion: number, now: Date): Promise<boolean>;
	complete(id: string, claimVersion: number): Promise<boolean>;
	fail(
		id: string,
		claimVersion: number,
		code: ScheduledFailureCode,
		permanent: boolean,
		now: Date,
	): Promise<boolean>;
}

function due(now: Date): Prisma.ScheduledTaskWhereInput {
	return {
		OR: [
			{
				status: "pending",
				runAt: { lte: now },
				OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
			},
			{ status: "retryable", nextAttemptAt: { lte: now } },
			{ status: { in: ["claimed", "processing"] }, leaseUntil: { lte: now } },
		],
	};
}

export class PrismaScheduledTaskRepository implements ScheduledTaskRepository {
	async schedule(input: {
		type: string;
		runAt: Date;
		guildId?: string | null;
		payload?: Prisma.InputJsonValue;
	}): Promise<ScheduledTask> {
		return getPrisma().scheduledTask.create({
			data: {
				type: input.type,
				runAt: input.runAt,
				nextAttemptAt: input.runAt,
				guildId: input.guildId ?? null,
				payload: input.payload ?? {},
			},
		});
	}

	async cancel(id: string): Promise<"cancelled" | "processing" | "terminal" | "missing"> {
		const changed = await getPrisma().scheduledTask.updateMany({
			where: { id, status: { in: ["pending", "retryable", "claimed"] } },
			data: { status: "cancelled", leaseUntil: null },
		});
		if (changed.count) return "cancelled";
		const row = await getPrisma().scheduledTask.findUnique({
			where: { id },
			select: { status: true },
		});
		return !row ? "missing" : row.status === "processing" ? "processing" : "terminal";
	}

	async claimDue(now: Date, limit: number, leaseMs: number): Promise<ScheduledTask[]> {
		const candidates = await getPrisma().scheduledTask.findMany({
			where: due(now),
			orderBy: [{ runAt: "asc" }, { id: "asc" }],
			take: Math.min(Math.max(limit, 0), 20),
			select: { id: true, attempts: true },
		});
		const claims = await Promise.all(
			candidates.map((candidate) =>
				getPrisma().$transaction(async (tx) => {
					if (candidate.attempts >= SCHEDULED_TASK_MAX_ATTEMPTS) {
						await tx.scheduledTask.updateMany({
							where: {
								id: candidate.id,
								...due(now),
								attempts: { gte: SCHEDULED_TASK_MAX_ATTEMPTS },
							},
							data: {
								status: "failed",
								leaseUntil: null,
								nextAttemptAt: null,
								lastError: "attempts_exhausted",
							},
						});
						return null;
					}
					const changed = await tx.scheduledTask.updateMany({
						where: { id: candidate.id, ...due(now), attempts: { lt: SCHEDULED_TASK_MAX_ATTEMPTS } },
						data: {
							status: "claimed",
							leaseUntil: new Date(now.getTime() + leaseMs),
							claimVersion: { increment: 1 },
						},
					});
					return changed.count
						? tx.scheduledTask.findUniqueOrThrow({ where: { id: candidate.id } })
						: null;
				}),
			),
		);
		return claims.filter((claim): claim is ScheduledTask => claim !== null);
	}

	async getClaim(id: string, claimVersion: number, now: Date): Promise<ScheduledTask | null> {
		return getPrisma().scheduledTask.findFirst({
			where: {
				id,
				claimVersion,
				status: "claimed",
				leaseUntil: { gt: now },
			},
		});
	}

	async accept(id: string, claimVersion: number, now: Date): Promise<boolean> {
		const changed = await getPrisma().scheduledTask.updateMany({
			where: {
				id,
				claimVersion,
				status: "claimed",
				leaseUntil: { gt: now },
				attempts: { lt: SCHEDULED_TASK_MAX_ATTEMPTS },
			},
			data: { status: "processing", attempts: { increment: 1 } },
		});
		return changed.count === 1;
	}

	async deferPublication(id: string, claimVersion: number, now: Date): Promise<boolean> {
		const changed = await getPrisma().scheduledTask.updateMany({
			where: { id, claimVersion, status: "claimed" },
			data: {
				status: "retryable",
				leaseUntil: null,
				nextAttemptAt: scheduledRetryAt(claimVersion, now),
				lastError: "publish_failed",
			},
		});
		return changed.count === 1;
	}

	async complete(id: string, claimVersion: number): Promise<boolean> {
		const changed = await getPrisma().scheduledTask.updateMany({
			where: { id, claimVersion, status: "processing" },
			data: { status: "completed", leaseUntil: null, lastError: null },
		});
		return changed.count === 1;
	}

	async fail(
		id: string,
		claimVersion: number,
		code: ScheduledFailureCode,
		permanent: boolean,
		now: Date,
	): Promise<boolean> {
		return getPrisma().$transaction(async (tx) => {
			const row = await tx.scheduledTask.findUnique({ where: { id } });
			if (
				!row ||
				row.claimVersion !== claimVersion ||
				!["claimed", "processing"].includes(row.status)
			)
				return false;
			const terminal = permanent || row.attempts >= SCHEDULED_TASK_MAX_ATTEMPTS;
			const changed = await tx.scheduledTask.updateMany({
				where: { id, claimVersion, status: row.status },
				data: {
					status: terminal ? "failed" : "retryable",
					leaseUntil: null,
					nextAttemptAt: terminal ? null : scheduledRetryAt(row.attempts, now),
					lastError: code,
				},
			});
			return changed.count === 1;
		});
	}
}
