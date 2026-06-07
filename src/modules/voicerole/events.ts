import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { getConfig, voiceRoleAction } from "./service.ts";

const log = getLogger("voicerole");

export const voiceRoleEvents: RegisteredEvent[] = [
	defineEvent("voiceStateUpdate", {
		execute: async (_client, oldState, newState) => {
			const action = voiceRoleAction(Boolean(oldState.channelId), Boolean(newState.channelId));
			if (action === "none") return;

			const guild = newState.guild;
			if (await isFeatureBlocked(guild.id, "voicerole")) return;
			const config = await getConfig(guild.id);
			if (!config) return;

			const member = newState.member ?? oldState.member;
			if (!member) return;
			const role = guild.roles.cache.get(config.roleId);
			if (
				!role ||
				role.managed ||
				role.position >= (guild.members.me?.roles.highest.position ?? 0)
			) {
				return; // missing, integration-managed, or above the bot - cannot assign
			}

			try {
				if (action === "add") {
					if (!member.roles.cache.has(role.id)) await member.roles.add(role, "Joined voice");
				} else if (member.roles.cache.has(role.id)) {
					await member.roles.remove(role, "Left voice");
				}
			} catch (err) {
				log.debug({ err, guildId: guild.id, action }, "voice role update failed");
			}
		},
	}),
];
