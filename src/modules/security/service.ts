import type { AntinukeConfig } from "@prisma/client";
import { type Guild, type GuildMember, MessageFlags, type User } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { Accent, container, text } from "@/utils/components.ts";

const log = getLogger("security");

export type AntinukeModule =
	| "antiBan"
	| "antiKick"
	| "antiBotAdd"
	| "antiChannel"
	| "antiRole"
	| "antiWebhook"
	| "antiGuildUpdate";

const cache = new Map<string, AntinukeConfig | null>();

/** Per-guild antinuke config (cached). Null when antinuke has never been configured. */
export async function getConfig(guildId: string): Promise<AntinukeConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.antinukeConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load antinuke config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

/** Create or update config, refreshing the cache. */
export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<AntinukeConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<AntinukeConfig> {
	const cfg = await getPrisma().antinukeConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	cache.set(guildId, cfg);
	return cfg;
}

export function invalidate(guildId: string): void {
	cache.delete(guildId);
}

/** A user is trusted (immune to antinuke) if they are the bot, the owner, an extra owner, or whitelisted. */
export function isTrusted(opts: {
	userId: string;
	botId: string;
	ownerId: string;
	extraOwners: string[];
	whitelist: string[];
}): boolean {
	return (
		opts.userId === opts.botId ||
		opts.userId === opts.ownerId ||
		opts.extraOwners.includes(opts.userId) ||
		opts.whitelist.includes(opts.userId)
	);
}

async function stripRoles(member: GuildMember, reason: string): Promise<void> {
	const removable = member.roles.cache.filter((r) => r.editable && r.id !== member.guild.id);
	for (const role of removable.values()) {
		await member.roles.remove(role, `[Antinuke] ${reason}`).catch(() => {});
	}
}

async function logAction(
	guild: Guild,
	config: AntinukeConfig,
	target: User,
	reason: string,
): Promise<void> {
	const block = container(Accent.error, [
		text("## 🛡️ Antinuke triggered"),
		text(
			`**User:** ${target.tag} (\`${target.id}\`)\n**Action:** ${config.punishment}\n**Reason:** ${reason}`,
		),
	]);
	if (config.logChannelId) {
		const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
		if (channel?.isTextBased()) {
			await channel
				.send({ components: [block], flags: MessageFlags.IsComponentsV2 })
				.catch(() => {});
		}
	}
	if (config.notifyOwner) {
		const owner = await guild.fetchOwner().catch(() => null);
		await owner?.user
			.send({ components: [block], flags: MessageFlags.IsComponentsV2 })
			.catch(() => {});
	}
}

/** Punish an untrusted actor according to the guild's configured punishment. */
export async function punish(
	guild: Guild,
	config: AntinukeConfig,
	userId: string,
	reason: string,
): Promise<void> {
	const botId = guild.client.user.id;
	if (
		isTrusted({
			userId,
			botId,
			ownerId: guild.ownerId,
			extraOwners: config.extraOwners,
			whitelist: config.whitelist,
		})
	) {
		return;
	}
	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member) return;
	const me = guild.members.me;
	if (me && member.roles.highest.position >= me.roles.highest.position) {
		log.warn({ userId, guild: guild.id }, "cannot punish - role hierarchy");
		return;
	}
	log.warn({ userId, guild: guild.id, reason }, "antinuke punishing");
	try {
		if (config.punishment === "kick") await member.kick(`[Antinuke] ${reason}`);
		else if (config.punishment === "strip") await stripRoles(member, reason);
		else await guild.members.ban(userId, { reason: `[Antinuke] ${reason}` });
	} catch (err) {
		log.error({ err, userId }, "punishment failed - stripping roles");
		await stripRoles(member, reason).catch(() => {});
	}
	await logAction(guild, config, member.user, reason);
}
