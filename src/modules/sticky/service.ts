import type { StickyMessage } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

/**
 * Sticky messages: keep one message pinned to the bottom of a channel by
 * deleting and reposting it whenever someone talks. Per-guild config is cached
 * in-process; the repost itself is debounced per channel so a busy channel does
 * not get hammered.
 */

export const STICKY_PREFIX = "📌";
const MAX_LEN = 2000;

const cache = new Map<string, Map<string, StickyMessage>>(); // guildId -> channelId -> row

export async function getGuildStickies(guildId: string): Promise<Map<string, StickyMessage>> {
	const hit = cache.get(guildId);
	if (hit) return hit;
	const rows = await getPrisma().stickyMessage.findMany({ where: { guildId } });
	const map = new Map(rows.map((r) => [r.channelId, r]));
	cache.set(guildId, map);
	return map;
}

export async function setSticky(
	guildId: string,
	channelId: string,
	content: string,
): Promise<void> {
	await getPrisma().stickyMessage.upsert({
		where: { channelId },
		create: { channelId, guildId, content },
		update: { content, lastMessageId: null },
	});
	cache.delete(guildId);
}

export async function removeSticky(guildId: string, channelId: string): Promise<boolean> {
	const res = await getPrisma().stickyMessage.deleteMany({ where: { channelId, guildId } });
	cache.delete(guildId);
	return res.count > 0;
}

export async function setLastMessageId(channelId: string, messageId: string | null): Promise<void> {
	await getPrisma().stickyMessage.updateMany({
		where: { channelId },
		data: { lastMessageId: messageId },
	});
}

/** Render the sticky body: ensure the pin marker and clamp to Discord's limit. */
export function buildStickyContent(raw: string): string {
	const trimmed = raw.trim();
	const withPin = trimmed.startsWith(STICKY_PREFIX) ? trimmed : `${STICKY_PREFIX} ${trimmed}`;
	return withPin.length > MAX_LEN ? withPin.slice(0, MAX_LEN) : withPin;
}
