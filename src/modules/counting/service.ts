import type { CountingConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("counting");

const cache = new Map<string, CountingConfig | null>(); // keyed by channelId

export async function getConfig(channelId: string): Promise<CountingConfig | null> {
	const cached = cache.get(channelId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.countingConfig.findUnique({ where: { channelId } })
		.catch((err) => {
			log.error({ err, channelId }, "failed to load counting config");
			return null;
		});
	cache.set(channelId, cfg);
	return cfg;
}

export async function setupChannel(guildId: string, channelId: string): Promise<CountingConfig> {
	const cfg = await getPrisma().countingConfig.upsert({
		where: { channelId },
		create: { channelId, guildId },
		update: { current: 0, lastUserId: null },
	});
	cache.set(channelId, cfg);
	return cfg;
}

export async function disableChannel(channelId: string): Promise<boolean> {
	const res = await getPrisma().countingConfig.deleteMany({ where: { channelId } });
	cache.delete(channelId);
	return res.count > 0;
}

async function persist(channelId: string, data: Partial<CountingConfig>): Promise<void> {
	const cfg = await getPrisma().countingConfig.update({ where: { channelId }, data });
	cache.set(channelId, cfg);
}

/** Parse the leading integer of a counting message ("5", "5 nice"), or null. */
export function parseCount(content: string): number | null {
	const match = content.trim().match(/^(\d{1,15})\b/);
	return match ? Number(match[1]) : null;
}

export type CountOutcome =
	| { type: "ignore" }
	| { type: "accept"; value: number; best: boolean }
	| { type: "reject"; reason: "wrong" | "double"; expected: number };

/**
 * Pure counting rule: the value must be exactly current+1 and must not come from
 * the same user who posted the previous number. Returns what should happen so
 * the event handler can react/persist accordingly.
 */
export function evaluateCount(
	config: Pick<CountingConfig, "current" | "best" | "lastUserId">,
	userId: string,
	value: number | null,
): CountOutcome {
	if (value === null) return { type: "ignore" };
	const expected = config.current + 1;
	if (config.lastUserId === userId) return { type: "reject", reason: "double", expected };
	if (value !== expected) return { type: "reject", reason: "wrong", expected };
	return { type: "accept", value, best: value > config.best };
}

/** Record a correct count. */
export function advance(
	channelId: string,
	value: number,
	userId: string,
	best: number,
): Promise<void> {
	return persist(channelId, { current: value, lastUserId: userId, best });
}

/** Reset the count after a mistake. */
export function reset(channelId: string): Promise<void> {
	return persist(channelId, { current: 0, lastUserId: null });
}
