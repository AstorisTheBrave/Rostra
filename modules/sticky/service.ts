import { createCoherentCache } from "@rostra/cache";
import type { StickyMessage } from "@rostra/database";
import { getPrisma } from "@rostra/database";

/**
 * Sticky messages: keep one message pinned to the bottom of a channel by
 * deleting and reposting it whenever someone talks. Per-guild config is cached
 * in-process; the repost itself is debounced per channel so a busy channel does
 * not get hammered.
 */

export const STICKY_PREFIX = "📌";
const MAX_LEN = 2000;

const cache = createCoherentCache<Map<string, StickyMessage>>("sticky", "guild");

export async function getGuildStickies(guildId: string): Promise<Map<string, StickyMessage>> {
	return cache.get(guildId, async () => {
		const rows = await getPrisma().stickyMessage.findMany({ where: { guildId } });
		return new Map(rows.map((r) => [r.channelId, r]));
	});
}

export async function setSticky(
	guildId: string,
	channelId: string,
	content: string,
): Promise<void> {
	await cache.write(
		guildId,
		(tx) =>
			tx.stickyMessage.upsert({
				where: { channelId },
				create: { channelId, guildId, content },
				update: { content, lastMessageId: null },
			}),
		() => undefined,
	);
}

export async function removeSticky(guildId: string, channelId: string): Promise<boolean> {
	const { value: res } = await cache.write(
		guildId,
		(tx) => tx.stickyMessage.deleteMany({ where: { channelId, guildId } }),
		() => undefined,
	);
	return res.count > 0;
}

export async function setLastMessageId(channelId: string, messageId: string | null): Promise<void> {
	const row = await getPrisma().stickyMessage.findUnique({
		where: { channelId },
		select: { guildId: true },
	});
	if (!row) return;
	await cache.write(
		row.guildId,
		(tx) =>
			tx.stickyMessage.updateMany({
				where: { channelId, guildId: row.guildId },
				data: { lastMessageId: messageId },
			}),
		() => undefined,
	);
}

/** Render the sticky body: ensure the pin marker and clamp to Discord's limit. */
export function buildStickyContent(raw: string): string {
	const trimmed = raw.trim();
	const withPin = trimmed.startsWith(STICKY_PREFIX) ? trimmed : `${STICKY_PREFIX} ${trimmed}`;
	return withPin.length > MAX_LEN ? withPin.slice(0, MAX_LEN) : withPin;
}
