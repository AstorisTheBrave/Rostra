import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { getConfig, statusMatches } from "./service.ts";

export const vanityEvents: RegisteredEvent[] = [
	defineEvent("presenceUpdate", {
		execute: async (_client, _oldPresence, newPresence) => {
			const guild = newPresence.guild;
			const member = newPresence.member;
			if (!guild || !member) return;

			const config = await getConfig(guild.id);
			if (!config || !config.enabled || !config.keyword || !config.roleId) return;

			const role = guild.roles.cache.get(config.roleId);
			if (!role || !role.editable) return;

			const texts = newPresence.activities.flatMap((a) => [a.name, a.state, a.details]);
			const matches = statusMatches(texts, config.keyword);
			const has = member.roles.cache.has(config.roleId);

			if (matches && !has) {
				await member.roles.add(config.roleId, "Vanity status role").catch(() => {});
			} else if (!matches && has) {
				await member.roles.remove(config.roleId, "Vanity status role removed").catch(() => {});
			}
		},
	}),
];
