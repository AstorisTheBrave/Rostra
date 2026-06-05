import { getPrisma } from "@/services/database.ts";
import type { Giveaway } from "@prisma/client";

/** Pick up to `count` unique random winners from a list of entry user ids. */
export function pickWinners(entries: string[], count: number): string[] {
	const pool = [...new Set(entries)];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = pool[i];
		const b = pool[j];
		if (a !== undefined && b !== undefined) {
			pool[i] = b;
			pool[j] = a;
		}
	}
	return pool.slice(0, Math.max(0, count));
}

export async function createGiveaway(data: {
	guildId: string;
	channelId: string;
	prize: string;
	winners: number;
	hostId: string;
	endsAt: Date;
}): Promise<Giveaway> {
	return getPrisma().giveaway.create({ data });
}

export async function setMessageId(id: string, messageId: string): Promise<void> {
	await getPrisma().giveaway.update({ where: { id }, data: { messageId } });
}

export async function getGiveaway(id: string): Promise<Giveaway | null> {
	return getPrisma().giveaway.findUnique({ where: { id } });
}

/** Add an entrant (idempotent). Returns the new entry count, or null if invalid/ended. */
export async function addEntry(id: string, userId: string): Promise<number | null> {
	const giveaway = await getPrisma().giveaway.findUnique({ where: { id } });
	if (!giveaway || giveaway.ended) return null;
	if (giveaway.entries.includes(userId)) return giveaway.entries.length;
	const updated = await getPrisma().giveaway.update({
		where: { id },
		data: { entries: { push: userId } },
	});
	return updated.entries.length;
}

/** Mark a giveaway ended and return the drawn winners. */
export async function endGiveaway(
	id: string,
): Promise<{ giveaway: Giveaway; winners: string[] } | null> {
	const giveaway = await getPrisma().giveaway.findUnique({ where: { id } });
	if (!giveaway) return null;
	const winners = pickWinners(giveaway.entries, giveaway.winners);
	if (!giveaway.ended) {
		await getPrisma().giveaway.update({ where: { id }, data: { ended: true } });
	}
	return { giveaway, winners };
}

/** Active (not-ended) giveaways, optionally scoped to a guild. */
export async function getActive(guildId?: string): Promise<Giveaway[]> {
	return getPrisma().giveaway.findMany({
		where: { ended: false, ...(guildId ? { guildId } : {}) },
	});
}
