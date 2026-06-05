import { config } from "@/config.ts";
import { cacheGet, cacheSet } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { Api } from "@top-gg/sdk";

const log = getLogger("topgg");

let api: Api | undefined;

/** Lazy top.gg Api client; undefined when no token is configured. */
export function getTopggApi(): Api | undefined {
	if (!config.topgg.token) return undefined;
	if (!api) api = new Api(config.topgg.token);
	return api;
}

export interface VotePayload {
	user: string;
	bot?: string;
	type?: string;
	isWeekend?: boolean;
}

/** Whether a user has voted recently (cached briefly). False if top.gg is not configured. */
export async function hasVoted(userId: string): Promise<boolean> {
	const client = getTopggApi();
	if (!client) return false;
	const cacheKey = `vote:${userId}`;
	const cached = await cacheGet<boolean>(cacheKey);
	if (cached !== undefined) return cached;
	try {
		const voted = await client.hasVoted(userId);
		await cacheSet(cacheKey, voted, 60_000);
		return voted;
	} catch (err) {
		log.error({ err }, "hasVoted failed");
		return false;
	}
}

/** Persist a vote and emit it for perk handlers. */
export async function recordVote(vote: VotePayload): Promise<void> {
	const prisma = getPrisma();
	try {
		await prisma.user.upsert({ where: { id: vote.user }, create: { id: vote.user }, update: {} });
		await prisma.userVote.create({
			data: { userId: vote.user, isWeekend: vote.isWeekend ?? false, source: "topgg" },
		});
		await cacheSet(`vote:${vote.user}`, true, 60_000);
		log.info({ user: vote.user, weekend: vote.isWeekend ?? false }, "vote recorded");
	} catch (err) {
		log.error({ err }, "recordVote failed");
	}
}

/** Constant-time-ish check that a webhook request carries the configured auth secret. */
export function verifyVoteAuth(
	header: string | undefined,
	secret = config.topgg.webhookAuth,
): boolean {
	if (!secret) return false;
	return header === secret;
}
