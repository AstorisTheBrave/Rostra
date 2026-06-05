import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { MessageFlags } from "discord.js";
import { birthdaysOn, getConfig, msUntilNextRun } from "./service.ts";

const log = getLogger("birthday");
const RUN_HOUR_UTC = 9;

async function runDaily(client: import("discord.js").Client): Promise<void> {
	const now = new Date();
	const todays = await birthdaysOn(now.getUTCMonth() + 1, now.getUTCDate());
	for (const birthday of todays) {
		const guild = client.guilds.cache.get(birthday.guildId);
		if (!guild) continue; // not this shard's guild
		const config = await getConfig(birthday.guildId);
		if (!config) continue;

		if (config.channelId) {
			const channel = await guild.channels.fetch(config.channelId).catch(() => null);
			if (channel?.isTextBased() && !channel.isDMBased()) {
				const message = config.message.replaceAll("{user}", `<@${birthday.userId}>`);
				await channel
					.send({
						components: [container(Accent.success, [text(message)])],
						flags: MessageFlags.IsComponentsV2,
					})
					.catch(() => {});
			}
		}
		if (config.roleId) {
			const member = await guild.members.fetch(birthday.userId).catch(() => null);
			if (member) {
				await member.roles.add(config.roleId, "Birthday").catch(() => {});
				setTimeout(
					() => void member.roles.remove(config.roleId as string, "Birthday over").catch(() => {}),
					23 * 60 * 60 * 1000,
				);
			}
		}
	}
	log.info({ count: todays.length }, "processed birthdays");
}

export const birthdayEvents: RegisteredEvent[] = [
	defineEvent("ready", {
		once: true,
		execute: (client) => {
			const schedule = (): void => {
				setTimeout(() => {
					void runDaily(client).finally(schedule);
				}, msUntilNextRun(RUN_HOUR_UTC));
			};
			schedule();
		},
	}),
];
