import { getPrisma } from "@/services/database.ts";

// ── AFK (in-memory authoritative, DB-backed for restart recovery) ────────────

export interface AfkEntry {
	reason: string;
	since: number;
}

const afk = new Map<string, AfkEntry>();
const key = (guildId: string, userId: string): string => `${guildId}:${userId}`;

/** Load persisted AFK statuses into memory (call on ready). */
export async function loadAfk(): Promise<void> {
	const rows = await getPrisma().afkStatus.findMany();
	for (const row of rows)
		afk.set(key(row.guildId, row.userId), { reason: row.reason, since: row.since.getTime() });
}

export async function setAfk(guildId: string, userId: string, reason: string): Promise<void> {
	afk.set(key(guildId, userId), { reason, since: Date.now() });
	await getPrisma().afkStatus.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId, reason },
		update: { reason, since: new Date() },
	});
}

export function getAfk(guildId: string, userId: string): AfkEntry | undefined {
	return afk.get(key(guildId, userId));
}

export async function clearAfk(guildId: string, userId: string): Promise<void> {
	if (!afk.delete(key(guildId, userId))) return;
	await getPrisma().afkStatus.deleteMany({ where: { guildId, userId } });
}

// ── Snipe (ephemeral, in-memory only) ────────────────────────────────────────

export interface Snipe {
	content: string;
	authorTag: string;
	at: number;
}

const snipes = new Map<string, Snipe>();

export function storeSnipe(channelId: string, snipe: Snipe): void {
	snipes.set(channelId, snipe);
}

export function getSnipe(channelId: string): Snipe | undefined {
	return snipes.get(channelId);
}

// ── Autoresponder (cached per guild) ─────────────────────────────────────────

export interface Responder {
	trigger: string;
	response: string;
}

const responders = new Map<string, Responder[]>();

export async function getResponders(guildId: string): Promise<Responder[]> {
	const cached = responders.get(guildId);
	if (cached) return cached;
	const rows = await getPrisma().autoResponder.findMany({ where: { guildId } });
	const list = rows.map((r) => ({ trigger: r.trigger.toLowerCase(), response: r.response }));
	responders.set(guildId, list);
	return list;
}

export async function addResponder(
	guildId: string,
	trigger: string,
	response: string,
): Promise<void> {
	await getPrisma().autoResponder.upsert({
		where: { guildId_trigger: { guildId, trigger: trigger.toLowerCase() } },
		create: { guildId, trigger: trigger.toLowerCase(), response },
		update: { response },
	});
	responders.delete(guildId);
}

export async function removeResponder(guildId: string, trigger: string): Promise<boolean> {
	const result = await getPrisma().autoResponder.deleteMany({
		where: { guildId, trigger: trigger.toLowerCase() },
	});
	responders.delete(guildId);
	return result.count > 0;
}

/** Find the first responder whose trigger appears in the message content. */
export function matchResponder(list: Responder[], content: string): Responder | undefined {
	const lower = content.toLowerCase();
	return list.find((r) => lower.includes(r.trigger));
}
