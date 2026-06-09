import type { LoggingConfig } from "@prisma/client";
import {
	type AuditLogEvent,
	type ContainerBuilder,
	type Guild,
	MessageFlags,
	PermissionFlagsBits,
} from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";

const log = getLogger("logging");

export type LogEvent = Extract<
	keyof LoggingConfig,
	| "messageDelete"
	| "messageEdit"
	| "memberJoin"
	| "memberLeave"
	| "memberBan"
	| "memberUnban"
	| "roleChanges"
	| "channelChanges"
	| "bulkDelete"
	| "voiceMoves"
	| "nicknameChanges"
>;

const cache = new Map<string, LoggingConfig | null>();

export async function getConfig(guildId: string): Promise<LoggingConfig | null> {
	const cached = cache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.loggingConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load logging config");
			return null;
		});
	cache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<LoggingConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<LoggingConfig> {
	const cfg = await getPrisma().loggingConfig.upsert({
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

/** Truncate a string for safe inclusion in a log entry. */
export function truncate(value: string, max = 1000): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Post a prebuilt log container to the configured channel if the event type is enabled. */
export async function sendLog(
	guild: Guild,
	event: LogEvent,
	build: () => ContainerBuilder,
): Promise<void> {
	if (await isFeatureBlocked(guild.id, "logging")) return;
	const config = await getConfig(guild.id);
	if (!config?.logChannelId || !config[event]) return;
	const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
	if (!channel?.isTextBased()) return;
	await channel.send({ components: [build()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

/**
 * Best-effort actor lookup from the guild audit log, so logs can name WHO did an
 * action the gateway event does not attribute (bans, kicks, role and channel
 * changes). Returns a ready-to-append "By: tag (id)" line, or "" when the bot
 * lacks View Audit Log, the entry is missing, or it is too old to be this event.
 */
export async function auditActor(
	guild: Guild,
	type: AuditLogEvent,
	targetId?: string,
): Promise<string> {
	if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return "";
	try {
		const logs = await guild.fetchAuditLogs({ type, limit: 5 });
		const now = Date.now();
		const entry = logs.entries.find((e) => {
			const matchesTarget = !targetId || (e.target as { id?: string } | null)?.id === targetId;
			return matchesTarget && now - e.createdTimestamp < 10_000;
		});
		const executor = entry?.executor;
		return executor ? `\n**By:** ${executor.tag} (\`${executor.id}\`)` : "";
	} catch {
		return "";
	}
}

/** Whether a channel id is in the ignore list. */
export async function isIgnored(guildId: string, channelId: string | null): Promise<boolean> {
	if (!channelId) return false;
	const config = await getConfig(guildId);
	return config?.ignoredChannels.includes(channelId) ?? false;
}
