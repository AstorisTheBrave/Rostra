import type { Birthday, BirthdayConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("birthday");

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Validate a day/month pair (allows Feb 29). */
export function isValidDate(day: number, month: number): boolean {
	if (month < 1 || month > 12) return false;
	const max = MONTH_DAYS[month - 1] ?? 31;
	return day >= 1 && day <= max;
}

/** Milliseconds from `now` until the next occurrence of `hourUtc`:00 UTC. */
export function msUntilNextRun(hourUtc: number, now = new Date()): number {
	const next = new Date(now);
	next.setUTCHours(hourUtc, 0, 0, 0);
	if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
	return next.getTime() - now.getTime();
}

const cache = new Map<string, BirthdayConfig | null>();

export async function getConfig(guildId: string): Promise<BirthdayConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.birthdayConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load birthday config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<BirthdayConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<BirthdayConfig> {
	const cfg = await getPrisma().birthdayConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	cache.set(guildId, cfg);
	return cfg;
}

export async function setBirthday(
	guildId: string,
	userId: string,
	day: number,
	month: number,
	year: number | null,
): Promise<void> {
	await getPrisma().birthday.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId, day, month, year },
		update: { day, month, year },
	});
}

export async function removeBirthday(guildId: string, userId: string): Promise<void> {
	await getPrisma().birthday.deleteMany({ where: { guildId, userId } });
}

export async function getBirthday(guildId: string, userId: string): Promise<Birthday | null> {
	return getPrisma().birthday.findUnique({ where: { guildId_userId: { guildId, userId } } });
}

/** All birthdays falling on a given month/day (across guilds - caller filters by shard). */
export async function birthdaysOn(month: number, day: number): Promise<Birthday[]> {
	return getPrisma().birthday.findMany({ where: { month, day } });
}

export async function listForGuild(guildId: string): Promise<Birthday[]> {
	return getPrisma().birthday.findMany({
		where: { guildId },
		orderBy: [{ month: "asc" }, { day: "asc" }],
	});
}
