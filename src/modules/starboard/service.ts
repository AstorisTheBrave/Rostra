import type { StarboardConfig, StarboardEntry } from "@prisma/client";
import { cachedConfig, invalidateConfig } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";

const cfgKey = (guildId: string) => `starboard:cfg:${guildId}`;

export async function getConfig(guildId: string): Promise<StarboardConfig | null> {
	return cachedConfig(cfgKey(guildId), () =>
		getPrisma().starboardConfig.findUnique({ where: { guildId } }),
	);
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<StarboardConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<StarboardConfig> {
	const row = await getPrisma().starboardConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	await invalidateConfig(cfgKey(guildId));
	return row;
}

/**
 * Normalise a star-emoji input to a stable identifier: the numeric id for a
 * custom emoji (`<a?:name:id>`), or the unicode emoji itself otherwise.
 */
export function parseStarEmoji(input: string): string {
	const custom = input.trim().match(/^<a?:\w+:(\d+)>$/);
	return custom?.[1] ?? input.trim();
}

/** The identifier used to match a reaction against the configured emoji. */
export function reactionKey(emoji: { id: string | null; name: string | null }): string {
	return emoji.id ?? emoji.name ?? "";
}

/** A display form for the configured emoji (custom id becomes a mention-ish form). */
export function emojiDisplay(stored: string): string {
	return /^\d+$/.test(stored) ? `<:star:${stored}>` : stored;
}

/**
 * Count valid stars from a reaction's users, excluding bots (when ignoreBots)
 * and the message author (when self-stars are disabled).
 */
export function effectiveStarCount(
	users: { id: string; bot: boolean }[],
	opts: { authorId: string; selfStar: boolean; ignoreBots: boolean },
): number {
	return users.filter((u) => {
		if (opts.ignoreBots && u.bot) return false;
		if (!opts.selfStar && u.id === opts.authorId) return false;
		return true;
	}).length;
}

export type StarboardAction = "post" | "remove" | "keep" | "none";

/**
 * Decide what to do with a message given its current star count. `post` covers
 * both first-post and count updates; `remove` un-posts. A separate (lower)
 * `removeThreshold` adds hysteresis so a post hovering at the threshold does not
 * flicker on and off - once posted it only drops when stars fall below the floor.
 */
export function decideStarboard(
	stars: number,
	threshold: number,
	removeThreshold: number | null,
	hasPost: boolean,
): StarboardAction {
	if (stars >= threshold) return "post";
	if (!hasPost) return "none";
	const floor = removeThreshold ?? threshold;
	return stars < floor ? "remove" : "keep";
}

/** Whether a single message's star count earns the reward role. */
export function earnsReward(stars: number, rewardStars: number): boolean {
	return rewardStars > 0 && stars >= rewardStars;
}

export async function getEntry(messageId: string): Promise<StarboardEntry | null> {
	return getPrisma().starboardEntry.findUnique({ where: { messageId } });
}

export async function upsertEntry(data: {
	guildId: string;
	channelId: string;
	messageId: string;
	authorId: string;
	stars: number;
	starboardMessageId?: string | null;
}): Promise<StarboardEntry> {
	return getPrisma().starboardEntry.upsert({
		where: { messageId: data.messageId },
		create: data,
		update: { stars: data.stars, starboardMessageId: data.starboardMessageId ?? undefined },
	});
}

export async function deleteEntry(messageId: string): Promise<StarboardEntry | null> {
	const entry = await getPrisma().starboardEntry.findUnique({ where: { messageId } });
	if (entry) await getPrisma().starboardEntry.delete({ where: { messageId } });
	return entry;
}

/** Top star-earning authors in a guild (sum of stars across their entries). */
export async function topStarred(
	guildId: string,
	limit = 10,
): Promise<{ authorId: string; stars: number }[]> {
	const rows = await getPrisma().starboardEntry.groupBy({
		by: ["authorId"],
		where: { guildId },
		_sum: { stars: true },
		orderBy: { _sum: { stars: "desc" } },
		take: limit,
	});
	return rows.map((r) => ({ authorId: r.authorId, stars: r._sum.stars ?? 0 }));
}
