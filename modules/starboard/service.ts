import { createCoherentCache } from "@rostra/cache";
import type {
	AutostarChannel,
	Prisma,
	Starboard,
	StarboardEntry,
	StarboardOverride,
} from "@rostra/database";
import { getPrisma } from "@rostra/database";

export type BoardWithOverrides = Starboard & { overrides: StarboardOverride[] };

// ── Boards (cached per guild) ────────────────────────────────────────────────

const boardCache = createCoherentCache<BoardWithOverrides[]>("starboard", "guild");
const autostarCache = createCoherentCache<AutostarChannel[]>("autostar", "guild");

export async function listBoards(guildId: string): Promise<BoardWithOverrides[]> {
	return boardCache.get(guildId, () =>
		getPrisma().starboard.findMany({
			where: { guildId },
			orderBy: { createdAt: "asc" },
			include: { overrides: true },
		}),
	);
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
	const { value: board } = await boardCache.write(
		data.guildId,
		(tx) => tx.starboard.create({ data }),
		() => undefined,
	);
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
	const { value: updated } = await boardCache.write(
		guildId,
		(tx) =>
			tx.starboard.update({
				where: { id: board.id },
				data: patch as Prisma.StarboardUncheckedUpdateInput,
			}),
		() => undefined,
	);
	return updated;
}

export async function deleteBoard(guildId: string, name: string): Promise<boolean> {
	const { value: res } = await boardCache.write(
		guildId,
		(tx) => tx.starboard.deleteMany({ where: { guildId, name } }),
		() => undefined,
	);
	return res.count > 0;
}

/** Enabled boards in a guild for which the reacted emoji is an up- or downvote. */
export async function boardsForEmoji(
	guildId: string,
	emojiKey: string,
): Promise<BoardWithOverrides[]> {
	const boards = await listBoards(guildId);
	return boards.filter(
		(b) => b.enabled && (b.emojis.includes(emojiKey) || b.downvoteEmojis.includes(emojiKey)),
	);
}

// ── Overrides ────────────────────────────────────────────────────────────────

export async function createOverride(data: {
	starboardId: string;
	guildId: string;
	name: string;
	scopeType: string;
	scopeIds: string[];
}): Promise<StarboardOverride> {
	const { value: row } = await boardCache.write(
		data.guildId,
		(tx) => tx.starboardOverride.create({ data }),
		() => undefined,
	);
	return row;
}

export async function updateOverride(
	guildId: string,
	starboardId: string,
	name: string,
	patch: Partial<
		Pick<
			StarboardOverride,
			"requiredStars" | "removeStars" | "selfStar" | "filterBots" | "scopeIds" | "enabled"
		>
	>,
): Promise<StarboardOverride | null> {
	const existing = await getPrisma().starboardOverride.findUnique({
		where: { starboardId_name: { starboardId, name } },
	});
	if (!existing) return null;
	const { value: row } = await boardCache.write(
		guildId,
		(tx) =>
			tx.starboardOverride.update({
				where: { id: existing.id },
				data: patch,
			}),
		() => undefined,
	);
	return row;
}

export async function deleteOverride(
	guildId: string,
	starboardId: string,
	name: string,
): Promise<boolean> {
	const { value: res } = await boardCache.write(
		guildId,
		(tx) => tx.starboardOverride.deleteMany({ where: { starboardId, name } }),
		() => undefined,
	);
	return res.count > 0;
}

// ── Autostar channels (cached per guild) ─────────────────────────────────────

export async function listAutostar(guildId: string): Promise<AutostarChannel[]> {
	return autostarCache.get(guildId, () =>
		getPrisma().autostarChannel.findMany({ where: { guildId } }),
	);
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
	const { value: row } = await autostarCache.write(
		guildId,
		(tx) =>
			tx.autostarChannel.upsert({
				where: { guildId_channelId: { guildId, channelId } },
				create: { guildId, channelId, emojis },
				update: { emojis },
			}),
		() => undefined,
	);
	return row;
}

export async function removeAutostar(guildId: string, channelId: string): Promise<boolean> {
	const { value: res } = await autostarCache.write(
		guildId,
		(tx) => tx.autostarChannel.deleteMany({ where: { guildId, channelId } }),
		() => undefined,
	);
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
