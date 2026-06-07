import type { Starboard } from "@prisma/client";
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
	boardsForEmoji,
	decideStarboard,
	deleteEntriesForMessage,
	earnsReward,
	effectiveStarCount,
	emojiDisplay,
	getAutostar,
	getEntry,
	listAutostar,
	listBoards,
	reactionKey,
	upsertEntry,
} from "./service.ts";

const log = getLogger("starboard");

function firstImageUrl(message: Message): string | undefined {
	return message.attachments.find((a) => (a.contentType ?? "").startsWith("image/"))?.url;
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

async function grantReward(message: Message, board: Starboard, stars: number): Promise<void> {
	if (!board.rewardRoleId || !earnsReward(stars, board.rewardStars) || !message.guild) return;
	const member = await message.guild.members.fetch(message.author.id).catch(() => null);
	if (!member || member.roles.cache.has(board.rewardRoleId)) return;
	await member.roles.add(board.rewardRoleId, "Starboard reward").catch(() => {});
}

/** Process one board for a message at a known star count. */
async function processBoard(board: Starboard, message: Message, stars: number): Promise<void> {
	if (board.ignoredChannels.includes(message.channelId)) return;
	// Role-based board: only accept messages whose author has the required role.
	if (board.authorRoleId) {
		const member = await message.guild?.members.fetch(message.author.id).catch(() => null);
		if (!member?.roles.cache.has(board.authorRoleId)) return;
	}
	const board2 = await message.client.channels.fetch(board.channelId).catch(() => null);
	if (!board2?.isTextBased() || board2.isDMBased()) return;

	const entry = await getEntry(board.id, message.id);
	const emoji = board.emojis[0] ?? "⭐";
	const action = decideStarboard(
		stars,
		board.requiredStars,
		board.removeStars,
		Boolean(entry?.starboardMessageId),
	);
	if (action === "none") return;
	const base = {
		starboardId: board.id,
		guildId: board.guildId,
		channelId: message.channelId,
		messageId: message.id,
		authorId: message.author.id,
		stars,
	};

	if (action === "post" || action === "keep") {
		const components = buildStarPost(message, stars, emoji);
		if (entry?.starboardMessageId) {
			const existing = await board2.messages.fetch(entry.starboardMessageId).catch(() => null);
			await existing?.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
			await upsertEntry({ ...base, starboardMessageId: entry.starboardMessageId });
		} else if (action === "post") {
			const posted = await board2
				.send({ components, flags: MessageFlags.IsComponentsV2 })
				.catch(() => null);
			await upsertEntry({ ...base, starboardMessageId: posted?.id ?? null });
		}
		if (action === "post") await grantReward(message, board, stars);
	} else if (action === "remove" && entry?.starboardMessageId) {
		const existing = await board2.messages.fetch(entry.starboardMessageId).catch(() => null);
		await existing?.delete().catch(() => {});
		await upsertEntry({ ...base, starboardMessageId: null });
	}
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

		const boards = await boardsForEmoji(guildId, reactionKey(reaction.emoji));
		if (boards.length === 0) return;

		// Never star messages that live in any of this guild's starboard channels.
		const boardChannelIds = new Set((await listBoards(guildId)).map((b) => b.channelId));
		if (boardChannelIds.has(message.channelId)) return;

		const reactors = await reaction.users.fetch().catch(() => null);
		if (!reactors) return;
		const reactorList = reactors.map((u) => ({ id: u.id, bot: u.bot }));

		for (const board of boards) {
			const stars = effectiveStarCount(reactorList, {
				authorId: message.author.id,
				selfStar: board.selfStar,
				filterBots: board.filterBots,
			});
			await processBoard(board, message, stars);
		}
	} catch (err) {
		log.error({ err }, "starboard reaction handling failed");
	}
}

async function handleAutostar(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || message.author?.bot) return;
	if (await isFeatureBlocked(message.guild.id, "starboard")) return;
	const config = await getAutostar(message.guild.id, message.channelId);
	if (!config) return;
	for (const emoji of config.emojis) {
		await message.react(emoji).catch(() => {});
	}
}

async function handleDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild) return;
	const boards = await listBoards(message.guild.id);
	const entries = await deleteEntriesForMessage(message.id);
	for (const entry of entries) {
		const board = boards.find((b) => b.id === entry.starboardId);
		if (!board?.syncDeletes || !entry.starboardMessageId) continue;
		const channel = await message.client.channels.fetch(board.channelId).catch(() => null);
		if (channel?.isTextBased() && !channel.isDMBased()) {
			const post = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
			await post?.delete().catch(() => {});
		}
	}
}

export const starboardEvents: RegisteredEvent[] = [
	defineEvent("messageReactionAdd", {
		execute: (_c, reaction, user) => handleReaction(reaction, user),
	}),
	defineEvent("messageReactionRemove", {
		execute: (_c, reaction, user) => handleReaction(reaction, user),
	}),
	defineEvent("messageCreate", {
		execute: async (_c, message) => {
			if (!message.inGuild() || message.author.bot) return;
			if (await listAutostar(message.guild.id).then((l) => l.length === 0)) return;
			await handleAutostar(message);
		},
	}),
	defineEvent("messageDelete", { execute: (_c, message) => handleDelete(message) }),
];
