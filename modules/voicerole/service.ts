import { createCoherentCache } from "@rostra/cache";
import type { VoiceRoleConfig } from "@rostra/database";
import { getPrisma } from "@rostra/database";

/**
 * Voice roles: grant a role while a member is connected to any voice channel and
 * remove it when they disconnect. Config is one row per guild, cached in-process.
 */

const cache = createCoherentCache<VoiceRoleConfig | null>("voicerole", "guild");

export async function getConfig(guildId: string): Promise<VoiceRoleConfig | null> {
	return cache.get(guildId, () => getPrisma().voiceRoleConfig.findUnique({ where: { guildId } }));
}

export async function setConfig(guildId: string, roleId: string): Promise<void> {
	await cache.write(guildId, (tx) =>
		tx.voiceRoleConfig.upsert({
			where: { guildId },
			create: { guildId, roleId },
			update: { roleId },
		}),
	);
}

export async function disableConfig(guildId: string): Promise<boolean> {
	const { value: res } = await cache.write(
		guildId,
		(tx) => tx.voiceRoleConfig.deleteMany({ where: { guildId } }),
		() => undefined,
	);
	return res.count > 0;
}

export type VoiceRoleAction = "add" | "remove" | "none";

/** Decide what to do with the voice role given old/new connection state. */
export function voiceRoleAction(wasConnected: boolean, isConnected: boolean): VoiceRoleAction {
	if (!wasConnected && isConnected) return "add";
	if (wasConnected && !isConnected) return "remove";
	return "none";
}
