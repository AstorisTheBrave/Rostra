import { defineEvent } from "@/client/defineEvent.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { advance, evaluateCount, getConfig, parseCount, reset } from "./service.ts";

export const countingEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (_client, message) => {
			if (message.author.bot || !message.inGuild()) return;
			const config = await getConfig(message.channelId);
			if (!config) return; // not a counting channel
			if (await isFeatureBlocked(message.guildId, "counting")) return;

			const outcome = evaluateCount(config, message.author.id, parseCount(message.content));
			if (outcome.type === "ignore") return;

			if (outcome.type === "accept") {
				await advance(
					message.channelId,
					outcome.value,
					message.author.id,
					Math.max(config.best, outcome.value),
				);
				await message.react(outcome.best ? "🏆" : "✅").catch(() => {});
				return;
			}

			await reset(message.channelId);
			await message.react("❌").catch(() => {});
			await message.channel
				.send(
					outcome.reason === "double"
						? `${message.author} you can't count twice in a row! Back to **1**.`
						: `${message.author} wrong number! It should have been **${outcome.expected}**. Back to **1**.`,
				)
				.catch(() => {});
		},
	}),
];
