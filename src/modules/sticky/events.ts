import type { SendableChannels } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { buildStickyContent, getGuildStickies, setLastMessageId } from "./service.ts";

const log = getLogger("sticky");

const DEBOUNCE_MS = 3000;
const timers = new Map<string, NodeJS.Timeout>(); // channelId -> pending repost

/** Delete the previous sticky and post a fresh one. Returns the new message id. */
async function repost(
	channel: SendableChannels,
	channelId: string,
	content: string,
	lastMessageId: string | null,
): Promise<string | null> {
	try {
		if (lastMessageId) await channel.messages.delete(lastMessageId).catch(() => {});
		const sent = await channel.send({ content: buildStickyContent(content) });
		await setLastMessageId(channelId, sent.id);
		return sent.id;
	} catch (err) {
		log.debug({ err, channelId }, "sticky repost failed");
		return lastMessageId;
	}
}

export const stickyEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (_client, message) => {
			if (message.author.bot || !message.inGuild()) return;
			if (await isFeatureBlocked(message.guild.id, "sticky")) return;
			const stickies = await getGuildStickies(message.guild.id);
			const row = stickies.get(message.channelId);
			if (!row) return;

			const channel = message.channel;
			if (!channel.isSendable()) return;

			// Debounce: refresh the timer so we repost once the channel goes quiet.
			const channelId = message.channelId;
			const existing = timers.get(channelId);
			if (existing) clearTimeout(existing);
			timers.set(
				channelId,
				setTimeout(() => {
					timers.delete(channelId);
					const current = stickies.get(channelId);
					if (!current) return;
					void repost(channel, channelId, current.content, current.lastMessageId).then((id) => {
						// Shared cache object: update so the next repost deletes the right message.
						const r = stickies.get(channelId);
						if (r) r.lastMessageId = id;
					});
				}, DEBOUNCE_MS),
			);
		},
	}),
];
