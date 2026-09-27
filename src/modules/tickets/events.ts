import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { recordTicketMessage } from "./service.ts";

export const ticketEvents: RegisteredEvent[] = [
	defineEvent("messageCreate", {
		execute: async (_client, message) => {
			if (message.author.bot || !message.inGuild()) return;
			await recordTicketMessage({
				channelId: message.channelId,
				guildId: message.guild.id,
				authorId: message.author.id,
				authorTag: message.author.tag,
				content: message.content || "(no text)",
				createdAt: message.createdAt,
				member: message.member,
				resolveMember: () => message.guild.members.fetch(message.author.id).catch(() => null),
			}).catch(() => {});
		},
	}),
];
