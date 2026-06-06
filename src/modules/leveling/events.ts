import { MessageFlags } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { addXp, getConfig, getRewards } from "./service.ts";

const lastXp = new Map<string, number>();

const rand = (min: number, max: number): number =>
	Math.floor(Math.random() * (max - min + 1)) + min;

export const levelingEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (_c, message) => {
			if (message.author.bot || !message.inGuild()) return;
			if (await isFeatureBlocked(message.guild.id, "leveling")) return;
			const config = await getConfig(message.guild.id);
			if (!config?.enabled) return;

			const key = `${message.guild.id}:${message.author.id}`;
			const now = Date.now();
			if (now - (lastXp.get(key) ?? 0) < config.cooldownMs) return;
			lastXp.set(key, now);

			const result = await addXp(
				message.guild.id,
				message.author.id,
				rand(config.xpMin, config.xpMax),
			);
			if (!result.leveledUp) return;

			const rewards = (await getRewards(message.guild.id)).filter((r) => r.level <= result.level);
			if (rewards.length && message.member) {
				await message.member.roles.add(rewards.map((r) => r.roleId)).catch(() => {});
			}

			const channelId = config.announceChannelId ?? message.channelId;
			const channel = await message.guild.channels.fetch(channelId).catch(() => null);
			const target = channel?.isTextBased() ? channel : message.channel;
			if (target.isTextBased() && !target.isDMBased()) {
				await target
					.send({
						components: [
							container(Accent.success, [
								text(`🎉 <@${message.author.id}> reached **level ${result.level}**!`),
							]),
						],
						flags: MessageFlags.IsComponentsV2,
					})
					.catch(() => {});
			}
		},
	}),
];
