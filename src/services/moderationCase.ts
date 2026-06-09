import { getPrisma } from "@/services/database.ts";

/** The kinds of moderation case the bot records. */
export type CaseType =
	| "ban"
	| "kick"
	| "timeout"
	| "untimeout"
	| "unban"
	| "warn"
	| "note"
	| "temprole";

export interface RecordCaseInput {
	guildId: string;
	type: CaseType;
	targetId: string;
	moderatorId: string;
	reason?: string | null;
	durationMs?: number | null;
}

/**
 * The single bookkeeping funnel for moderation history: write exactly one
 * `ModerationCase` with a per-guild sequential case number. The moderation module
 * and automod both route through this so automated actions land in the same case
 * history as human ones (moderatorId `AUTOMOD` for automod). Returns the new case
 * number.
 */
export async function recordCase(input: RecordCaseInput): Promise<number> {
	const prisma = getPrisma();
	return prisma.$transaction(async (tx) => {
		const counter = await tx.guildCaseCounter.upsert({
			where: { guildId: input.guildId },
			create: { guildId: input.guildId, count: 1 },
			update: { count: { increment: 1 } },
		});
		const caseNumber = counter.count;
		await tx.moderationCase.create({
			data: {
				guildId: input.guildId,
				caseNumber,
				type: input.type,
				targetId: input.targetId,
				moderatorId: input.moderatorId,
				reason: input.reason ?? null,
				durationMs: input.durationMs ?? null,
			},
		});
		return caseNumber;
	});
}
