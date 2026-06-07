import {
	type Message,
	MessageFlags,
	type MessageReaction,
	type PartialMessage,
	type PartialMessageReaction,
	type PartialUser,
	type User,
} from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, actionRow, container, gallery, linkButton, text } from "@/ui";
import {
	deleteEntry,
	effectiveStarCount,
	emojiDisplay,
	getConfig,
	getEntry,
	reactionKey,
	upsertEntry,
} from "./service.ts";

const log = getLogger("starboard");

function firstImageUrl(message: Message): string | undefined {
	const attachment = message.attachments.find((a) => (a.contentType ?? "").startsWith("image/"));
	return attachment?.url;
}

function buildStarPost(message: Message, stars: number, emoji: string) {
	const content = message.content?.slice(0, 1800) ?? "";
	const header = `${emojiDisplay(emoji)} **${stars}**  ·  <#${message.channelId}>`;
	const body = content
		? `${header}\n\n${content}\n\n- by <@${message.author.id}>`
		: `${header}\n\n- by <@${message.author.id}>`;
	const image = firstImageUrl(message);
	return [
		container(Accent.warn, image ? [text(body), gallery([image])] : [text(body)]),
		actionRow(linkButton("Jump to message", message.url)),
	];
}

type AnyReaction = MessageReaction | PartialMessageReaction;

async function handleReaction(reaction: AnyReaction, _user: User | PartialUser): Promise<void> {
	try {
		if (reaction.partial) reaction = await reaction.fetch();
		const message = reaction.message.partial
			? await reaction.message.fetch()
			: (reaction.message as Message);
		if (!message.guild || !message.author) return;
		const guildId = message.guild.id;

		if (await isFeatureBlocked(guildId, "starboard")) return;
		const config = await getConfig(guildId);
		if (!config?.channelId) return;
		if (reactionKey(reaction.emoji) !== config.emoji) return;
		// Never star the starboard's own posts or ignored channels.
		if (message.channelId === config.channelId) return;
		if (config.ignoredChannels.includes(message.channelId)) return;

		const reactors = await reaction.users.fetch().catch(() => null);
		if (!reactors) return;
		const stars = effectiveStarCount(
			reactors.map((u) => ({ id: u.id, bot: u.bot })),
			{ authorId: message.author.id, selfStar: config.selfStar, ignoreBots: config.ignoreBots },
		);

		const board = await message.client.channels.fetch(config.channelId).catch(() => null);
		if (!board?.isTextBased() || board.isDMBased()) return;
		const entry = await getEntry(message.id);

		if (stars >= config.threshold) {
			const components = buildStarPost(message, stars, config.emoji);
			if (entry?.starboardMessageId) {
				const existing = await board.messages.fetch(entry.starboardMessageId).catch(() => null);
				await existing?.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
				await upsertEntry({
					guildId,
					channelId: message.channelId,
					messageId: message.id,
					authorId: message.author.id,
					stars,
					starboardMessageId: entry.starboardMessageId,
				});
			} else {
				const posted = await board
					.send({ components, flags: MessageFlags.IsComponentsV2 })
					.catch(() => null);
				await upsertEntry({
					guildId,
					channelId: message.channelId,
					messageId: message.id,
					authorId: message.author.id,
					stars,
					starboardMessageId: posted?.id ?? null,
				});
			}
		} else if (entry?.starboardMessageId) {
			const existing = await board.messages.fetch(entry.starboardMessageId).catch(() => null);
			await existing?.delete().catch(() => {});
			await upsertEntry({
				guildId,
				channelId: message.channelId,
				messageId: message.id,
				authorId: message.author.id,
				stars,
				starboardMessageId: null,
			});
		}
	} catch (err) {
		log.error({ err }, "starboard reaction handling failed");
	}
}

async function handleDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild) return;
	const config = await getConfig(message.guild.id);
	if (!config?.channelId || !config.syncDeletes) return;
	const entry = await deleteEntry(message.id);
	if (!entry?.starboardMessageId) return;
	const board = await message.client.channels.fetch(config.channelId).catch(() => null);
	if (board?.isTextBased() && !board.isDMBased()) {
		const post = await board.messages.fetch(entry.starboardMessageId).catch(() => null);
		await post?.delete().catch(() => {});
	}
}

export const starboardEvents: RegisteredEvent[] = [
	defineEvent("messageReactionAdd", {
		execute: (_c, reaction, user) => handleReaction(reaction, user),
	}),
	defineEvent("messageReactionRemove", {
		execute: (_c, reaction, user) => handleReaction(reaction, user),
	}),
	defineEvent("messageDelete", { execute: (_c, message) => handleDelete(message) }),
];
