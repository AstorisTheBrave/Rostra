import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { clearAfk, getAfk, getResponders, loadAfk, matchResponder, storeSnipe } from "./service.ts";

export const extrasEvents: RegisteredEvent[] = [
	defineEvent("ready", { once: true, execute: () => loadAfk() }),

	defineEvent("messageCreate", {
		execute: async (_c, message) => {
			if (message.author.bot || !message.inGuild()) return;

			// Clear the author's own AFK.
			if (getAfk(message.guild.id, message.author.id)) {
				await clearAfk(message.guild.id, message.author.id);
				await message
					.reply({
						content: `👋 Welcome back, ${message.author.username}! Removed your AFK.`,
						allowedMentions: { repliedUser: false },
					})
					.catch(() => {});
			}

			// Notify when an AFK user is mentioned.
			if (message.mentions.users.size) {
				const notes: string[] = [];
				for (const user of message.mentions.users.values()) {
					const status = getAfk(message.guild.id, user.id);
					if (status) notes.push(`💤 **${user.username}** is AFK: ${status.reason}`);
				}
				if (notes.length) {
					await message
						.reply({ content: notes.join("\n"), allowedMentions: { repliedUser: false } })
						.catch(() => {});
				}
			}

			// Autoresponder.
			if (message.content) {
				const responders = await getResponders(message.guild.id);
				if (responders.length) {
					const match = matchResponder(responders, message.content);
					if (match) await message.channel.send({ content: match.response }).catch(() => {});
				}
			}
		},
	}),

	defineEvent("messageDelete", {
		execute: (_c, message) => {
			if (message.partial || message.author?.bot || !message.guild) return;
			storeSnipe(message.channelId, {
				content: message.content ?? "",
				authorTag: message.author?.tag ?? "Unknown",
				at: Date.now(),
			});
		},
	}),
];
