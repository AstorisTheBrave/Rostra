import { cacheSet } from "@rostra/cache";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

const log = getLogger("api:vote");

export interface VotePayload {
	user: string;
	bot?: string;
	type?: string;
	isWeekend?: boolean;
}

export function parseVotePayload(value: unknown): VotePayload | undefined {
	if (typeof value !== "object" || value === null || !("user" in value)) return undefined;
	if (typeof value.user !== "string" || value.user.length === 0) return undefined;
	return {
		user: value.user,
		...("bot" in value && typeof value.bot === "string" ? { bot: value.bot } : {}),
		...("type" in value && typeof value.type === "string" ? { type: value.type } : {}),
		...("isWeekend" in value && typeof value.isWeekend === "boolean"
			? { isWeekend: value.isWeekend }
			: {}),
	};
}

/** Persist a valid external vote. Failures remain logged and do not expose storage details. */
export async function recordVote(vote: VotePayload): Promise<void> {
	try {
		const prisma = getPrisma();
		await prisma.user.upsert({ where: { id: vote.user }, create: { id: vote.user }, update: {} });
		await prisma.userVote.create({
			data: { userId: vote.user, isWeekend: vote.isWeekend ?? false, source: "topgg" },
		});
		await cacheSet(`vote:${vote.user}`, true, 60_000);
		log.info({ user: vote.user, weekend: vote.isWeekend ?? false }, "vote recorded");
	} catch (error) {
		log.error({ err: error }, "recordVote failed");
	}
}
