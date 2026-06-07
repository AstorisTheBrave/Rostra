import type { ModmailConfig, ModmailThread } from "@prisma/client";
import { ChannelType, type Client, type Guild, type ThreadChannel, type User } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";

const log = getLogger("modmail");

const configCache = new Map<string, ModmailConfig | null>();

// ── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(guildId: string): Promise<ModmailConfig | null> {
	const cached = configCache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.modmailConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load modmail config");
			return null;
		});
	configCache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<ModmailConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<ModmailConfig> {
	const cfg = await getPrisma().modmailConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	configCache.set(guildId, cfg);
	return cfg;
}

// ── Threads ──────────────────────────────────────────────────────────────────

export function getThreadByChannel(channelId: string): Promise<ModmailThread | null> {
	return getPrisma().modmailThread.findUnique({ where: { channelId } });
}

export function getOpenThreadByUser(
	guildId: string,
	userId: string,
): Promise<ModmailThread | null> {
	return getPrisma().modmailThread.findFirst({ where: { guildId, userId, open: true } });
}

export async function closeThread(channelId: string): Promise<ModmailThread | null> {
	const thread = await getPrisma().modmailThread.findUnique({ where: { channelId } });
	if (!thread?.open) return null;
	return getPrisma().modmailThread.update({ where: { channelId }, data: { open: false } });
}

/**
 * Find the guild whose modmail a DM should open in: the first mutual guild (in
 * this shard's cache) with modmail enabled and a parent channel set. DMs route to
 * shard 0, so at multi-shard scale only shard-0 guilds are visible - a documented
 * limitation.
 */
export async function findModmailGuild(client: Client, user: User): Promise<Guild | null> {
	for (const guild of client.guilds.cache.values()) {
		if (await isFeatureBlocked(guild.id, "modmail")) continue;
		const config = await getConfig(guild.id);
		if (!config?.enabled || !config.channelId) continue;
		const member = await guild.members.fetch(user.id).catch(() => null);
		if (member) return guild;
	}
	return null;
}

/** Open a new modmail thread in the guild's staff channel and persist it. */
export async function createThread(
	guild: Guild,
	config: ModmailConfig,
	user: User,
): Promise<ThreadChannel | null> {
	if (!config.channelId) return null;
	const parent = await guild.channels.fetch(config.channelId).catch(() => null);
	if (!parent || parent.type !== ChannelType.GuildText) return null;
	try {
		const thread = await parent.threads.create({
			name: `modmail-${user.username}`.slice(0, 90),
			type: ChannelType.PublicThread,
			reason: `Modmail opened by ${user.tag}`,
		});
		await getPrisma().modmailThread.create({
			data: { guildId: guild.id, userId: user.id, channelId: thread.id },
		});
		return thread;
	} catch (err) {
		log.error({ err, guild: guild.id }, "failed to create modmail thread");
		return null;
	}
}

/** Compose a relay line, appending any attachment URLs. */
export function relayBody(label: string, content: string, attachments: string[]): string {
	const parts = [content.trim()].filter(Boolean);
	if (attachments.length) parts.push(attachments.join("\n"));
	const body = parts.join("\n") || "*(no content)*";
	return `**${label}:** ${body}`;
}

/** Staff notes start with `//` and are kept internal (never relayed to the user). */
export function isStaffNote(content: string): boolean {
	return content.trimStart().startsWith("//");
}
