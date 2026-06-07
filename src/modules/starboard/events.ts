import type { Starboard, StarboardOverride } from "@prisma/client";
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
	type AccessLists,
	type DisplayTier,
	isAllowed,
	type MessageFacts,
	netStars,
	type OverrideRule,
	passesFilters,
	type Reactor,
	resolveSettings,
	tierEmoji,
} from "./eligibility.ts";
import {
	type BoardWithOverrides,
	boardsForEmoji,
	decideStarboard,
	deleteEntriesForMessage,
	earnsReward,
	emojiDisplay,
	getAutostar,
	getEntry,
	listAutostar,
	listBoards,
	reactionKey,
	upsertEntry,
} from "./service.ts";

const log = getLogger("starboard");

function accessLists(board: Starboard): AccessLists {
	return {
		blacklistUsers: board.blacklistUsers,
		blacklistRoles: board.blacklistRoles,
		blacklistChannels: board.blacklistChannels,
		whitelistUsers: board.whitelistUsers,
		whitelistRoles: board.whitelistRoles,
		whitelistChannels: board.whitelistChannels,
	};
}

function overrideRules(overrides: StarboardOverride[]): OverrideRule[] {
	return overrides.map((o) => ({
		scopeType: o.scopeType,
		scopeIds: o.scopeIds,
		enabled: o.enabled,
		requiredStars: o.requiredStars,
		removeStars: o.removeStars,
		selfStar: o.selfStar,
		filterBots: o.filterBots,
	}));
}

function displayTiersOf(board: Starboard): DisplayTier[] {
	return Array.isArray(board.displayTiers) ? (board.displayTiers as unknown as DisplayTier[]) : [];
}

function firstImageUrl(message: Message): string | undefined {
	return message.attachments.find((a) => (a.contentType ?? "").startsWith("image/"))?.url;
}

function messageFacts(message: Message): MessageFacts {
	const hasImage =
		Boolean(firstImageUrl(message)) || message.embeds.some((e) => e.image || e.thumbnail);
	return {
		contentLength: message.content?.length ?? 0,
		attachmentCount: message.attachments.size,
		hasImage,
		ageMs: Date.now() - message.createdTimestamp,
		channelNsfw: "nsfw" in message.channel ? Boolean(message.channel.nsfw) : false,
	};
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

/** Member role ids, only fetched when a board actually filters on roles. */
async function rolesIfNeeded(message: Message, userId: string, needed: boolean): Promise<string[]> {
	if (!needed || !message.guild) return [];
	const member = await message.guild.members.fetch(userId).catch(() => null);
	return member ? [...member.roles.cache.keys()] : [];
}

/** Collect reactors for a set of emoji keys, attaching role ids when needed. */
async function collectReactors(
	message: Message,
	emojiKeys: string[],
	needRoles: boolean,
): Promise<Reactor[]> {
	const out: Reactor[] = [];
	for (const reaction of message.reactions.cache.values()) {
		if (!emojiKeys.includes(reactionKey(reaction.emoji))) continue;
		const users = await reaction.users.fetch().catch(() => null);
		if (!users) continue;
		for (const u of users.values()) {
			out.push({ id: u.id, bot: u.bot, roleIds: await rolesIfNeeded(message, u.id, needRoles) });
		}
	}
	return out;
}

/** Process one board for a message: resolve settings, count net stars, filter, post/remove. */
async function processBoard(board: BoardWithOverrides, message: Message): Promise<void> {
	if (!message.author) return;
	if (board.ignoredChannels.includes(message.channelId)) return;

	const authorRoles = await rolesIfNeeded(
		message,
		message.author.id,
		Boolean(board.authorRoleId) ||
			board.blacklistRoles.length > 0 ||
			board.whitelistRoles.length > 0,
	);
	// Role-based board: author must have the required role.
	if (board.authorRoleId && !authorRoles.includes(board.authorRoleId)) return;
	// Blacklisted authors' messages cannot be starred.
	if (
		!isAllowed(
			{ userId: message.author.id, roleIds: authorRoles, channelId: message.channelId },
			accessLists(board),
		)
	)
		return;
	// Message filters.
	if (
		!passesFilters(messageFacts(message), {
			minChars: board.minChars,
			minAttachments: board.minAttachments,
			requireImage: board.requireImage,
			maxMessageAgeHours: board.maxMessageAgeHours,
			requireNsfwChannel: board.requireNsfwChannel,
		})
	)
		return;

	// Effective settings after overrides for this message's context.
	const eff = resolveSettings(
		{
			requiredStars: board.requiredStars,
			removeStars: board.removeStars,
			selfStar: board.selfStar,
			filterBots: board.filterBots,
		},
		overrideRules(board.overrides),
		{ channelId: message.channelId, roleIds: authorRoles },
	);

	const needRoles = board.blacklistRoles.length > 0 || board.whitelistRoles.length > 0;
	const upvoters = await collectReactors(message, board.emojis, needRoles);
	const downvoters = board.downvoteEmojis.length
		? await collectReactors(message, board.downvoteEmojis, needRoles)
		: [];
	const stars = netStars({
		upvoters,
		downvoters,
		authorId: message.author.id,
		selfStar: eff.selfStar,
		filterBots: eff.filterBots,
		lists: accessLists(board),
	});

	const channel = await message.client.channels.fetch(board.channelId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) return;
	const entry = await getEntry(board.id, message.id);
	const action = decideStarboard(
		stars,
		eff.requiredStars,
		eff.removeStars,
		Boolean(entry?.starboardMessageId),
	);
	if (action === "none") return;
	const emoji = tierEmoji(stars, displayTiersOf(board), board.emojis[0] ?? "⭐");
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
			const existing = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
			await existing?.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
			await upsertEntry({ ...base, starboardMessageId: entry.starboardMessageId });
		} else if (action === "post") {
			const posted = await channel
				.send({ components, flags: MessageFlags.IsComponentsV2 })
				.catch(() => null);
			await upsertEntry({ ...base, starboardMessageId: posted?.id ?? null });
		}
		if (action === "post") await grantReward(message, board, stars);
	} else if (action === "remove" && entry?.starboardMessageId) {
		const existing = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
		await existing?.delete().catch(() => {});
		await upsertEntry({ ...base, starboardMessageId: null });
	}
}

/** Strip a reaction that is not a valid star for a board (remove-invalid-reactions). */
async function maybeRemoveInvalid(
	reaction: MessageReaction,
	user: User | PartialUser,
	message: Message,
	boards: BoardWithOverrides[],
): Promise<void> {
	const key = reactionKey(reaction.emoji);
	for (const board of boards) {
		if (!board.removeInvalid || !board.emojis.includes(key)) continue;
		if (!message.author) continue;
		const reactorRoles = await rolesIfNeeded(
			message,
			user.id,
			board.blacklistRoles.length > 0 || board.whitelistRoles.length > 0,
		);
		const selfBad = !board.selfStar && user.id === message.author.id;
		const botBad = board.filterBots && user.bot;
		const listBad = !isAllowed(
			{ userId: user.id, roleIds: reactorRoles, channelId: message.channelId },
			accessLists(board),
		);
		if (selfBad || botBad || listBad) {
			await reaction.users.remove(user.id).catch(() => {});
			return;
		}
	}
}

type AnyReaction = MessageReaction | PartialMessageReaction;

async function handleReaction(
	reaction: AnyReaction,
	user: User | PartialUser,
	isAdd: boolean,
): Promise<void> {
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

		// Never star messages living in any of this guild's starboard channels.
		const boardChannelIds = new Set((await listBoards(guildId)).map((b) => b.channelId));
		if (boardChannelIds.has(message.channelId)) return;

		if (isAdd && !user.bot) {
			await maybeRemoveInvalid(reaction as MessageReaction, user, message, boards);
		}
		for (const board of boards) await processBoard(board, message);
	} catch (err) {
		log.error({ err }, "starboard reaction handling failed");
	}
}

async function handleAutostar(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || message.author?.bot) return;
	if (await isFeatureBlocked(message.guild.id, "starboard")) return;
	const config = await getAutostar(message.guild.id, message.channelId);
	if (!config) return;
	for (const emoji of config.emojis) await message.react(emoji).catch(() => {});
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
		execute: (_c, reaction, user) => handleReaction(reaction, user, true),
	}),
	defineEvent("messageReactionRemove", {
		execute: (_c, reaction, user) => handleReaction(reaction, user, false),
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
