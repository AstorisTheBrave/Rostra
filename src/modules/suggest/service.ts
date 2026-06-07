import type { Suggestion, SuggestionConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

const configCache = new Map<string, SuggestionConfig | null>();

// ── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(guildId: string): Promise<SuggestionConfig | null> {
	const cached = configCache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma().suggestionConfig.findUnique({ where: { guildId } });
	configCache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Pick<SuggestionConfig, "channelId" | "enabled">>,
): Promise<SuggestionConfig> {
	const cfg = await getPrisma().suggestionConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	configCache.set(guildId, cfg);
	return cfg;
}

// ── Suggestions ──────────────────────────────────────────────────────────────

async function nextNumber(guildId: string): Promise<number> {
	const counter = await getPrisma().guildSuggestionCounter.upsert({
		where: { guildId },
		create: { guildId, count: 1 },
		update: { count: { increment: 1 } },
	});
	return counter.count;
}

export async function createSuggestion(data: {
	guildId: string;
	channelId: string;
	userId: string;
	text: string;
}): Promise<Suggestion> {
	const number = await nextNumber(data.guildId);
	return getPrisma().suggestion.create({ data: { ...data, number } });
}

export async function setMessageId(id: string, messageId: string): Promise<void> {
	await getPrisma().suggestion.update({ where: { id }, data: { messageId } });
}

export function getSuggestion(id: string): Promise<Suggestion | null> {
	return getPrisma().suggestion.findUnique({ where: { id } });
}

export function getByNumber(guildId: string, number: number): Promise<Suggestion | null> {
	return getPrisma().suggestion.findUnique({ where: { guildId_number: { guildId, number } } });
}

export interface VoteTally {
	up: number;
	down: number;
}

/**
 * Toggle a user's vote: voting the same direction again clears it; voting the
 * opposite flips it. Returns false if the suggestion is missing or decided.
 */
export async function castVote(id: string, userId: string, value: 1 | -1): Promise<boolean> {
	const suggestion = await getPrisma().suggestion.findUnique({ where: { id } });
	if (suggestion?.status !== "open") return false;
	const existing = await getPrisma().suggestionVote.findUnique({
		where: { suggestionId_userId: { suggestionId: id, userId } },
	});
	if (existing?.value === value) {
		await getPrisma().suggestionVote.delete({ where: { id: existing.id } });
	} else {
		await getPrisma().suggestionVote.upsert({
			where: { suggestionId_userId: { suggestionId: id, userId } },
			create: { suggestionId: id, userId, value },
			update: { value },
		});
	}
	return true;
}

export async function tally(id: string): Promise<VoteTally> {
	const votes = await getPrisma().suggestionVote.findMany({ where: { suggestionId: id } });
	return {
		up: votes.filter((v) => v.value === 1).length,
		down: votes.filter((v) => v.value === -1).length,
	};
}

export async function decide(
	guildId: string,
	number: number,
	status: "approved" | "denied",
	reason: string | null,
): Promise<Suggestion | null> {
	const suggestion = await getByNumber(guildId, number);
	if (suggestion?.status !== "open") return null;
	return getPrisma().suggestion.update({
		where: { id: suggestion.id },
		data: { status, reason },
	});
}
