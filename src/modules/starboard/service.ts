import type { AutostarChannel, Starboard, StarboardEntry } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

// ── Boards (cached per guild) ────────────────────────────────────────────────

const boardCache = new Map<string, Starboard[]>();
const autostarCache = new Map<string, AutostarChannel[]>();

export async function listBoards(guildId: string): Promise<Starboard[]> {
	const cached = boardCache.get(guildId);
	if (cached) return cached;
	const rows = await getPrisma().starboard.findMany({
		where: { guildId },
		orderBy: { createdAt: "asc" },
	});
	boardCache.set(guildId, rows);
	return rows;
}

export function getBoard(guildId: string, name: string): Promise<Starboard | null> {
	return getPrisma().starboard.findUnique({ where: { guildId_name: { guildId, name } } });
}

export async function createBoard(data: {
	guildId: string;
	name: string;
	channelId: string;
	emojis: string[];
}): Promise<Starboard> {
	const board = await getPrisma().starboard.create({ data });
	boardCache.delete(data.guildId);
	return board;
}

export async function updateBoard(
	guildId: string,
	name: string,
	patch: Partial<Omit<Starboard, "id" | "guildId" | "name" | "createdAt" | "updatedAt">>,
): Promise<Starboard | null> {
	const board = await getPrisma().starboard.findUnique({
		where: { guildId_name: { guildId, name } },
	});
	if (!board) return null;
	const updated = await getPrisma().starboard.update({ where: { id: board.id }, data: patch });
	boardCache.delete(guildId);
	return updated;
}

export async function deleteBoard(guildId: string, name: string): Promise<boolean> {
	const res = await getPrisma().starboard.deleteMany({ where: { guildId, name } });
	boardCache.delete(guildId);
	return res.count > 0;
}

/** Enabled boards in a guild whose emoji list contains the reacted emoji. */
export async function boardsForEmoji(guildId: string, emojiKey: string): Promise<Starboard[]> {
	const boards = await listBoards(guildId);
	return boards.filter((b) => b.enabled && b.emojis.includes(emojiKey));
}

// ── Autostar channels (cached per guild) ─────────────────────────────────────

export async function listAutostar(guildId: string): Promise<AutostarChannel[]> {
	const cached = autostarCache.get(guildId);
	if (cached) return cached;
	const rows = await getPrisma().autostarChannel.findMany({ where: { guildId } });
	autostarCache.set(guildId, rows);
	return rows;
}

export async function getAutostar(
	guildId: string,
	channelId: string,
): Promise<AutostarChannel | null> {
	const rows = await listAutostar(guildId);
	return rows.find((a) => a.channelId === channelId) ?? null;
}

export async function addAutostar(
	guildId: string,
	channelId: string,
	emojis: string[],
): Promise<AutostarChannel> {
	const row = await getPrisma().autostarChannel.upsert({
		where: { guildId_channelId: { guildId, channelId } },
		create: { guildId, channelId, emojis },
		update: { emojis },
	});
	autostarCache.delete(guildId);
	return row;
}

export async function removeAutostar(guildId: string, channelId: string): Promise<boolean> {
	const res = await getPrisma().autostarChannel.deleteMany({ where: { guildId, channelId } });
	autostarCache.delete(guildId);
	return res.count > 0;
}

// ── Emoji helpers (pure) ─────────────────────────────────────────────────────

/** Normalise one emoji input to a stable identifier (custom id, or the unicode char). */
export function parseStarEmoji(input: string): string {
	const custom = input.trim().match(/^<a?:\w+:(\d+)>$/);
	return custom?.[1] ?? input.trim();
}

/** Parse a space/comma separated list of emojis into stable identifiers. */
export function parseEmojiList(input: string): string[] {
	return [
		...new Set(
			input
				.split(/[\s,]+/)
				.map((e) => e.trim())
				.filter(Boolean)
				.map((e) => parseStarEmoji(e)),
		),
	];
}

/** The identifier used to match a reaction against a board's emoji list. */
export function reactionKey(emoji: { id: string | null; name: string | null }): string {
	return emoji.id ?? emoji.name ?? "";
}

/** A display form for a stored emoji (custom id becomes a mention-ish form). */
export function emojiDisplay(stored: string): string {
	return /^\d+$/.test(stored) ? `<:star:${stored}>` : stored;
}

// ── Star counting + post decision (pure) ─────────────────────────────────────

export function effectiveStarCount(
	users: { id: string; bot: boolean }[],
	opts: { authorId: string; selfStar: boolean; filterBots: boolean },
): number {
	return users.filter((u) => {
		if (opts.filterBots && u.bot) return false;
		if (!opts.selfStar && u.id === opts.authorId) return false;
		return true;
	}).length;
}

export type StarboardAction = "post" | "remove" | "keep" | "none";

/**
 * Decide what to do with a message on one board given its star count. `post`
 * covers first-post and updates; a separate (lower) `removeStars` floor adds
 * hysteresis so a post hovering at the threshold does not flicker.
 */
export function decideStarboard(
	stars: number,
	requiredStars: number,
	removeStars: number | null,
	hasPost: boolean,
): StarboardAction {
	if (stars >= requiredStars) return "post";
	if (!hasPost) return "none";
	const floor = removeStars ?? requiredStars;
	return stars < floor ? "remove" : "keep";
}

export function earnsReward(stars: number, rewardStars: number): boolean {
	return rewardStars > 0 && stars >= rewardStars;
}

// ── Entries ──────────────────────────────────────────────────────────────────

export function getEntry(starboardId: string, messageId: string): Promise<StarboardEntry | null> {
	return getPrisma().starboardEntry.findUnique({
		where: { starboardId_messageId: { starboardId, messageId } },
	});
}

export async function upsertEntry(data: {
	starboardId: string;
	guildId: string;
	channelId: string;
	messageId: string;
	authorId: string;
	stars: number;
	starboardMessageId?: string | null;
}): Promise<StarboardEntry> {
	return getPrisma().starboardEntry.upsert({
		where: { starboardId_messageId: { starboardId: data.starboardId, messageId: data.messageId } },
		create: data,
		update: { stars: data.stars, starboardMessageId: data.starboardMessageId ?? undefined },
	});
}

/** All starboard entries for an original message (one per board it reached). */
export function entriesForMessage(messageId: string): Promise<StarboardEntry[]> {
	return getPrisma().starboardEntry.findMany({ where: { messageId } });
}

export async function deleteEntriesForMessage(messageId: string): Promise<StarboardEntry[]> {
	const rows = await entriesForMessage(messageId);
	if (rows.length) await getPrisma().starboardEntry.deleteMany({ where: { messageId } });
	return rows;
}

/** Top star-earning authors across all of a guild's boards. */
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
