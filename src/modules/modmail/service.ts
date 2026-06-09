import type { ModmailConfig, ModmailThread } from "@prisma/client";
import { ChannelType, type Client, type Guild, type ThreadChannel } from "discord.js";
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

/** True if the user has any moderation case in this guild (drives appeal-only mode). */
export async function hasModerationCase(guildId: string, userId: string): Promise<boolean> {
	const count = await getPrisma()
		.moderationCase.count({ where: { guildId, targetId: userId } })
		.catch(() => 0);
	return count > 0;
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

/** Plain, serializable user info that can cross a shard boundary (no User object). */
export interface ModmailUser {
	id: string;
	tag: string;
	username: string;
}

/** Guild ids with modmail enabled and a channel set (small set, queried fresh). */
export async function enabledModmailGuildIds(): Promise<string[]> {
	const rows = await getPrisma().modmailConfig.findMany({
		where: { enabled: true, channelId: { not: null } },
		select: { guildId: true },
	});
	return rows.map((r) => r.guildId);
}

export interface ModmailTarget {
	guildId: string;
	shardId: number;
}

/**
 * Find which guild (and which shard owns it) a DM should open modmail in: the
 * first mutual, modmail-enabled guild the user belongs to. DMs always arrive on
 * shard 0, so this asks every shard (via `broadcastEval`) which of the enabled
 * guilds it owns and the user is a member of - correct at any shard count.
 * Falls back to a local scan when running as a single process (no sharding).
 */
export async function findModmailTarget(
	client: Client,
	userId: string,
): Promise<ModmailTarget | null> {
	const guildIds = await enabledModmailGuildIds();
	if (guildIds.length === 0) return null;

	if (!client.shard) {
		for (const gid of guildIds) {
			const guild = client.guilds.cache.get(gid);
			if (!guild) continue;
			const member = await guild.members.fetch(userId).catch(() => null);
			if (member) return { guildId: gid, shardId: 0 };
		}
		return null;
	}

	const results = (await client.shard.broadcastEval(
		async (c, ctx) => {
			for (const gid of ctx.guildIds) {
				const guild = c.guilds.cache.get(gid);
				if (!guild) continue;
				const member = await guild.members.fetch(ctx.userId).catch(() => null);
				if (member) return { guildId: gid, shardId: c.shard?.ids[0] ?? 0 };
			}
			return null;
		},
		{ context: { guildIds, userId } },
	)) as (ModmailTarget | null)[];
	return results.find((r): r is ModmailTarget => r != null) ?? null;
}

/** Open a new modmail thread in the guild's staff channel and persist it. */
export async function createThread(
	guild: Guild,
	config: ModmailConfig,
	user: ModmailUser,
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

/**
 * Open or continue the user's modmail thread in `guildId` and post their message.
 * Runs on the shard that owns the guild (directly, or invoked there via the
 * cross-shard relay). Returns false if the guild/config is unavailable.
 */
export async function relayUserMessage(
	client: Client,
	guildId: string,
	user: ModmailUser,
	content: string,
	attachments: string[],
): Promise<boolean> {
	const guild = client.guilds.cache.get(guildId);
	if (!guild) return false;
	if (await isFeatureBlocked(guildId, "modmail")) return false;
	const config = await getConfig(guildId);
	if (!config?.enabled || !config.channelId) return false;

	// Abuse controls: blocked users are silently ignored; appeal-only mode limits
	// new conversations to members who actually have a moderation case to appeal.
	if (config.blockedUsers.includes(user.id)) return false;
	if (config.appealOnly && !(await getOpenThreadByUser(guildId, user.id))) {
		if (!(await hasModerationCase(guildId, user.id))) {
			const u = await client.users.fetch(user.id).catch(() => null);
			await u
				?.send(
					`📪 Staff DMs for **${guild.name}** are only open for appealing a moderation action (a warning, timeout, or ban). If you believe this is a mistake, contact a server admin another way.`,
				)
				.catch(() => {});
			return false;
		}
	}

	const record = await getOpenThreadByUser(guildId, user.id);
	let thread: ThreadChannel | null = null;
	if (record) {
		const existing = await guild.channels.fetch(record.channelId).catch(() => null);
		thread = existing?.isThread() ? existing : null;
		if (!thread || thread.archived) {
			await closeThread(record.channelId).catch(() => {});
			thread = null;
		}
	}
	if (!thread) {
		thread = await createThread(guild, config, user);
		if (!thread) return false;
		await thread
			.send(
				`# 📬 New modmail\n**From:** ${user.tag} (\`${user.id}\`)\nReply here to message them. Lines starting with \`//\` stay internal.`,
			)
			.catch(() => {});
	}
	await thread.send(relayBody(user.username, content, attachments)).catch(() => {});
	return true;
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
