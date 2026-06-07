import { PermissionFlagsBits } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { getGuildHighlights, markActive, resolveHits } from "./service.ts";

const log = getLogger("highlight");

export const highlightEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (_client, message) => {
			if (message.author.bot || !message.inGuild()) return;
			const guildId = message.guild.id;

			// Record activity first so a subscriber who is chatting here is skipped.
			markActive(message.channelId, message.author.id);

			if (await isFeatureBlocked(guildId, "highlights")) return;
			const highlights = await getGuildHighlights(guildId);
			if (highlights.length === 0) return;

			const hits = resolveHits(highlights, message.content, message.author.id, message.channelId);
			if (hits.length === 0) return;

			const jump = `https://discord.com/channels/${guildId}/${message.channelId}/${message.id}`;
			const snippet =
				message.content.length > 280 ? `${message.content.slice(0, 277)}...` : message.content;

			for (const hit of hits) {
				try {
					const member = await message.guild.members.fetch(hit.userId).catch(() => null);
					if (!member) continue;
					// Only notify members who can actually see the channel.
					if (!message.channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
						continue;
					}
					await member.send({
						content:
							`🔔 You were highlighted for **${hit.word}** in **${message.guild.name}** ` +
							`(${message.channel.toString()})\n` +
							`**${message.author.username}:** ${snippet}\n${jump}`,
						allowedMentions: { parse: [] },
					});
				} catch (err) {
					log.debug({ err, userId: hit.userId }, "highlight DM failed");
				}
			}
		},
	}),
];
