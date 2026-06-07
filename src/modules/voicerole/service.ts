import type { VoiceRoleConfig } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

/**
 * Voice roles: grant a role while a member is connected to any voice channel and
 * remove it when they disconnect. Config is one row per guild, cached in-process.
 */

const cache = new Map<string, VoiceRoleConfig | null>();

export async function getConfig(guildId: string): Promise<VoiceRoleConfig | null> {
	if (cache.has(guildId)) return cache.get(guildId) ?? null;
	const row = await getPrisma().voiceRoleConfig.findUnique({ where: { guildId } });
	cache.set(guildId, row);
	return row;
}

export async function setConfig(guildId: string, roleId: string): Promise<void> {
	await getPrisma().voiceRoleConfig.upsert({
		where: { guildId },
		create: { guildId, roleId },
		update: { roleId },
	});
	cache.delete(guildId);
}

export async function disableConfig(guildId: string): Promise<boolean> {
	const res = await getPrisma().voiceRoleConfig.deleteMany({ where: { guildId } });
	cache.delete(guildId);
	return res.count > 0;
}

export type VoiceRoleAction = "add" | "remove" | "none";

/** Decide what to do with the voice role given old/new connection state. */
export function voiceRoleAction(wasConnected: boolean, isConnected: boolean): VoiceRoleAction {
	if (!wasConnected && isConnected) return "add";
	if (wasConnected && !isConnected) return "remove";
	return "none";
}
