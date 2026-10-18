import { cacheGet, cacheSet } from "@rostra/cache";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import { Api } from "@top-gg/sdk";

const log = getLogger("topgg");

let api: Api | undefined;

/** Lazy top.gg Api client; undefined when no token is configured. */
export function getTopggApi(): Api | undefined {
	if (!config.topgg.token) return undefined;
	if (!api) api = new Api(config.topgg.token);
	return api;
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
