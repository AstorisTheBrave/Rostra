import type { Reminder } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

const UNIT_MS: Record<string, number> = {
	s: 1000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
};

/** Max reminder horizon: 365 days. */
export const MAX_REMINDER_MS = 365 * 86_400_000;

/**
 * Parse a compound duration like "10m", "1h30m", "2d" into milliseconds.
 * Returns null when nothing parses.
 */
export function parseDuration(input: string): number | null {
	let total = 0;
	let found = false;
	for (const m of input.toLowerCase().matchAll(/(\d+)\s*(s|m|h|d|w)/g)) {
		total += Number(m[1]) * (UNIT_MS[m[2] ?? ""] ?? 0);
		found = true;
	}
	return found ? total : null;
}

export async function createReminder(data: {
	userId: string;
	guildId: string;
	channelId: string;
	message: string;
	dueAt: Date;
}): Promise<Reminder> {
	return getPrisma().reminder.create({ data });
}

export async function getReminder(id: string): Promise<Reminder | null> {
	return getPrisma().reminder.findUnique({ where: { id } });
}

/** A user's pending reminders in a guild, soonest first. */
export async function listUserReminders(userId: string, guildId: string): Promise<Reminder[]> {
	return getPrisma().reminder.findMany({
		where: { userId, guildId },
		orderBy: { dueAt: "asc" },
	});
}

/** Delete a reminder only if it belongs to the user. Returns whether one was removed. */
export async function cancelReminder(id: string, userId: string): Promise<boolean> {
	const result = await getPrisma().reminder.deleteMany({ where: { id, userId } });
	return result.count > 0;
}

export async function deleteReminder(id: string): Promise<void> {
	await getPrisma().reminder.deleteMany({ where: { id } });
}

/** All reminders, optionally scoped to a guild (used to reschedule on boot). */
export async function getPendingReminders(guildId?: string): Promise<Reminder[]> {
	return getPrisma().reminder.findMany({
		where: guildId ? { guildId } : {},
	});
}
