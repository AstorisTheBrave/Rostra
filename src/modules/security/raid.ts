import type { AntinukeConfig } from "@prisma/client";
import { type Client, type Guild, GuildVerificationLevel, MessageFlags } from "discord.js";
import { getLogger } from "@/services/logger.ts";
import { schedule } from "@/services/scheduler.ts";
import { Accent, container, text } from "@/utils/components.ts";

/**
 * Anti-raid: detect join floods (N joins within M seconds) and put the server
 * into a temporary lockdown by raising the verification level, then auto-lift
 * via the durable scheduler. State is in-memory per shard, which is safe because
 * a guild is always owned by a single shard.
 */

const log = getLogger("security:raid");
const LOCK_LEVEL = GuildVerificationLevel.VeryHigh;

const joinWindows = new Map<string, number[]>(); // guildId -> recent join timestamps
const locked = new Map<string, GuildVerificationLevel>(); // guildId -> level to restore on lift

/** Push a join time, drop ones outside the window, and report whether the flood threshold is met. */
export function recordJoin(
	guildId: string,
	threshold: number,
	windowSec: number,
	now = Date.now(),
): boolean {
	const cutoff = now - windowSec * 1000;
	const times = (joinWindows.get(guildId) ?? []).filter((t) => t > cutoff);
	times.push(now);
	joinWindows.set(guildId, times);
	return times.length >= threshold;
}

export function isLocked(guildId: string): boolean {
	return locked.has(guildId);
}

async function alert(guild: Guild, config: AntinukeConfig, body: string): Promise<void> {
	const block = container(Accent.error, [text("## 🚨 Anti-raid"), text(body)]);
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

/**
 * Raise the verification level and schedule an auto-lift. Returns false if a
 * lockdown is already active. `lockMinutes` of 0 means manual-only (no auto-lift).
 */
export async function triggerLockdown(
	guild: Guild,
	config: AntinukeConfig,
	client: Client,
	reason: string,
	lockMinutes = config.raidLockMinutes,
): Promise<boolean> {
	if (locked.has(guild.id)) return false;
	const restoreLevel = guild.verificationLevel;
	locked.set(guild.id, restoreLevel);
	try {
		if (guild.verificationLevel !== LOCK_LEVEL) {
			await guild.setVerificationLevel(LOCK_LEVEL, "[Anti-raid] lockdown");
		}
	} catch (err) {
		log.warn({ err, guild: guild.id }, "could not raise verification level");
	}
	await alert(
		guild,
		config,
		`${reason}\nVerification raised to **Very High**.${lockMinutes > 0 ? ` Auto-lifts in ${lockMinutes} min.` : " Lift it with `/security panic state:off`."}`,
	);
	if (lockMinutes > 0) {
		await schedule(
			{
				type: "raid_unlock",
				runAt: new Date(Date.now() + lockMinutes * 60_000),
				guildId: guild.id,
				payload: { guildId: guild.id, restoreLevel },
			},
			client,
		);
	}
	return true;
}

/**
 * Lift a lockdown immediately, restoring the prior verification level. Uses the
 * in-memory restore level; `fallbackLevel` covers a process restart that lost it.
 */
export async function liftLockdown(
	guild: Guild,
	fallbackLevel?: GuildVerificationLevel,
): Promise<void> {
	const restoreLevel = locked.get(guild.id) ?? fallbackLevel ?? GuildVerificationLevel.Low;
	locked.delete(guild.id);
	joinWindows.delete(guild.id);
	try {
		if (guild.verificationLevel !== restoreLevel) {
			await guild.setVerificationLevel(restoreLevel, "[Anti-raid] lockdown lifted");
		}
	} catch (err) {
		log.warn({ err, guild: guild.id }, "could not restore verification level");
	}
}

/** Scheduler handler: auto-lift a raid lockdown (payload carries guildId + restoreLevel). */
export async function raidUnlockTask(payload: unknown, client: Client): Promise<void> {
	const data = (payload ?? {}) as { guildId?: string; restoreLevel?: number };
	if (!data.guildId) return;
	const guild = client.guilds.cache.get(data.guildId);
	if (!guild) {
		locked.delete(data.guildId);
		return;
	}
	const restoreLevel = (data.restoreLevel ?? GuildVerificationLevel.Low) as GuildVerificationLevel;
	await liftLockdown(guild, restoreLevel);
}
