import type { Highlight } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

/**
 * Highlights: DM a member when one of their subscribed words is said in the
 * guild. Per-guild word lists are cached in-process and invalidated on write;
 * the scan runs on the messageCreate hot path so it must stay cheap.
 */

export const MAX_WORDS = 25;
export const MIN_WORD_LEN = 2;
const NOTIFY_COOLDOWN_MS = 60_000; // per (guild,user) - avoid DM spam
const ACTIVE_WINDOW_MS = 5 * 60_000; // skip if the subscriber spoke here recently

const cache = new Map<string, Highlight[]>();
const lastNotified = new Map<string, number>(); // `${guildId}:${userId}` -> ts
const lastActive = new Map<string, number>(); // `${channelId}:${userId}` -> ts

export async function getGuildHighlights(guildId: string): Promise<Highlight[]> {
	const hit = cache.get(guildId);
	if (hit) return hit;
	const rows = await getPrisma().highlight.findMany({ where: { guildId } });
	cache.set(guildId, rows);
	return rows;
}

export async function listHighlights(guildId: string, userId: string): Promise<string[]> {
	const rows = await getGuildHighlights(guildId);
	return rows.filter((h) => h.userId === userId).map((h) => h.word);
}

export async function addHighlight(
	guildId: string,
	userId: string,
	word: string,
): Promise<"ok" | "exists" | "limit" | "tooShort"> {
	const clean = word.trim().toLowerCase();
	if (clean.length < MIN_WORD_LEN) return "tooShort";
	const current = await listHighlights(guildId, userId);
	if (current.includes(clean)) return "exists";
	if (current.length >= MAX_WORDS) return "limit";
	await getPrisma().highlight.create({ data: { guildId, userId, word: clean } });
	cache.delete(guildId);
	return "ok";
}

export async function removeHighlight(
	guildId: string,
	userId: string,
	word: string,
): Promise<boolean> {
	const res = await getPrisma().highlight.deleteMany({
		where: { guildId, userId, word: word.trim().toLowerCase() },
	});
	cache.delete(guildId);
	return res.count > 0;
}

export async function clearHighlights(guildId: string, userId: string): Promise<number> {
	const res = await getPrisma().highlight.deleteMany({ where: { guildId, userId } });
	cache.delete(guildId);
	return res.count;
}

/** Record that a user just spoke in a channel (suppresses highlights briefly). */
export function markActive(channelId: string, userId: string): void {
	lastActive.set(`${channelId}:${userId}`, Date.now());
}

function isActive(channelId: string, userId: string): boolean {
	const ts = lastActive.get(`${channelId}:${userId}`);
	return ts !== undefined && Date.now() - ts < ACTIVE_WINDOW_MS;
}

/** True if this user may be notified now (per-user cooldown), and arms it. */
function takeCooldown(guildId: string, userId: string): boolean {
	const k = `${guildId}:${userId}`;
	const ts = lastNotified.get(k);
	if (ts !== undefined && Date.now() - ts < NOTIFY_COOLDOWN_MS) return false;
	lastNotified.set(k, Date.now());
	return true;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match of `word` inside `content`. */
export function wordMatches(content: string, word: string): boolean {
	return new RegExp(`(?:^|\\W)${escapeRe(word)}(?:$|\\W)`, "i").test(content);
}

export interface HighlightHit {
	userId: string;
	word: string;
}

/**
 * Resolve which subscribers to notify for a message. Excludes the author,
 * anyone recently active in the channel, and anyone on cooldown (cooldown is
 * consumed for those returned). Pure-ish: callers still do the permission check
 * and DM. `content` should be the raw message content.
 */
export function resolveHits(
	highlights: Highlight[],
	content: string,
	authorId: string,
	channelId: string,
): HighlightHit[] {
	if (!content) return [];
	const seen = new Set<string>();
	const hits: HighlightHit[] = [];
	for (const h of highlights) {
		if (h.userId === authorId || seen.has(h.userId)) continue;
		if (!wordMatches(content, h.word)) continue;
		if (isActive(channelId, h.userId)) continue;
		if (!takeCooldown(h.guildId, h.userId)) continue;
		seen.add(h.userId);
		hits.push({ userId: h.userId, word: h.word });
	}
	return hits;
}
