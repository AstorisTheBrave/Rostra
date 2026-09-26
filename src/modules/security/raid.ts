import type { AntinukeConfig } from "@prisma/client";
import { type Client, type Guild, GuildVerificationLevel, MessageFlags } from "discord.js";
import { getLogger } from "@/services/logger.ts";
import { schedule } from "@/services/scheduler.ts";
import { getTenant, updateTenant } from "@/services/tenant.ts";
import { Accent, container, text } from "@/utils/components.ts";

/**
 * Anti-raid: detect join floods (N joins within M seconds) and put the server
 * into a temporary lockdown by raising the verification level, then auto-lift
 * via the durable scheduler. Hot state stays in-memory per shard, while the
 * restore metadata is also persisted so a process restart cannot create a
 * second overlapping lockdown with the wrong restore level.
 */

const log = getLogger("security:raid");
const LOCK_LEVEL = GuildVerificationLevel.VeryHigh;
const RAID_SETTING = "securityRaidLock";
const PANIC_SETTING = "securityPanic";

const joinWindows = new Map<string, number[]>(); // guildId -> recent join timestamps
const locked = new Map<string, GuildVerificationLevel>(); // guildId -> level to restore on lift

export interface PersistedRaidLock {
	active: true;
	restoreLevel: number;
	unlockAt: number;
}

function settingsRecord(settings: unknown): Record<string, unknown> {
	return settings && typeof settings === "object" && !Array.isArray(settings)
		? (settings as Record<string, unknown>)
		: {};
}

function parsePersistedRaidLock(settings: unknown): PersistedRaidLock | null {
	const value = settingsRecord(settings)[RAID_SETTING];
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (
		record.active !== true ||
		typeof record.restoreLevel !== "number" ||
		typeof record.unlockAt !== "number"
	) {
		return null;
	}
	return {
		active: true,
		restoreLevel: record.restoreLevel,
		unlockAt: record.unlockAt,
	};
}

function hasPersistedPanic(settings: unknown): boolean {
	const value = settingsRecord(settings)[PANIC_SETTING];
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return (value as Record<string, unknown>).active === true;
}

export async function getPersistedRaidLock(guildId: string): Promise<PersistedRaidLock | null> {
	const tenant = await getTenant(guildId);
	return parsePersistedRaidLock(tenant.settings);
}

async function persistRaidLock(
	guildId: string,
	restoreLevel: GuildVerificationLevel,
	unlockAt: number,
): Promise<void> {
	const tenant = await getTenant(guildId);
	const settings = settingsRecord(tenant.settings);
	await updateTenant(guildId, {
		settings: {
			...settings,
			[RAID_SETTING]: { active: true, restoreLevel, unlockAt },
		},
	});
}

export async function clearPersistedRaidLock(guildId: string): Promise<void> {
	const tenant = await getTenant(guildId);
	const settings = { ...settingsRecord(tenant.settings) };
	if (!(RAID_SETTING in settings)) return;
	delete settings[RAID_SETTING];
	await updateTenant(guildId, { settings });
}

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
	if (lockMinutes > 0) {
		const tenant = await getTenant(guild.id);
		if (parsePersistedRaidLock(tenant.settings) || hasPersistedPanic(tenant.settings)) return false;
	}

	const restoreLevel = guild.verificationLevel;
	const unlockAt = Date.now() + Math.max(0, lockMinutes) * 60_000;
	if (lockMinutes > 0) {
		await persistRaidLock(guild.id, restoreLevel, unlockAt);
	}
	locked.set(guild.id, restoreLevel);

	try {
		if (guild.verificationLevel !== LOCK_LEVEL) {
			await guild.setVerificationLevel(LOCK_LEVEL, "[Anti-raid] lockdown");
		}
	} catch (err) {
		locked.delete(guild.id);
		if (lockMinutes > 0) await clearPersistedRaidLock(guild.id).catch(() => {});
		log.warn({ err, guild: guild.id }, "could not raise verification level");
		return false;
	}

	await alert(
		guild,
		config,
		`${reason}\nVerification raised to **Very High**.${lockMinutes > 0 ? ` Auto-lifts in ${lockMinutes} min.` : " Lift it with `/security panic state:off`."}`,
	);
	if (lockMinutes > 0) {
		try {
			await schedule(
				{
					type: "raid_unlock",
					runAt: new Date(unlockAt),
					guildId: guild.id,
					payload: { guildId: guild.id, restoreLevel, unlockAt },
				},
				client,
			);
		} catch (err) {
			log.error({ err, guild: guild.id }, "could not schedule raid auto-lift");
			await alert(
				guild,
				config,
				"Automatic unlock scheduling failed. Use `/security panic state:off` to restore the previous verification level.",
			);
		}
	}
	return true;
}

/**
 * Lift a lockdown immediately, restoring the prior verification level. Uses the
 * in-memory restore level; `fallbackLevel` covers a process restart that lost it.
 * Returns whether Discord accepted the restore operation.
 */
export async function liftLockdown(
	guild: Guild,
	fallbackLevel?: GuildVerificationLevel,
): Promise<boolean> {
	const restoreLevel = locked.get(guild.id) ?? fallbackLevel ?? GuildVerificationLevel.Low;
	try {
		if (guild.verificationLevel !== restoreLevel) {
			await guild.setVerificationLevel(restoreLevel, "[Anti-raid] lockdown lifted");
		}
		locked.delete(guild.id);
		joinWindows.delete(guild.id);
		return true;
	} catch (err) {
		log.warn({ err, guild: guild.id }, "could not restore verification level");
		return false;
	}
}

/** Scheduler handler: auto-lift a raid lockdown (payload carries its generation metadata). */
export async function raidUnlockTask(payload: unknown, client: Client): Promise<void> {
	const data = (payload ?? {}) as {
		guildId?: string;
		restoreLevel?: number;
		unlockAt?: number;
	};
	if (!data.guildId) return;
	const guild = client.guilds.cache.get(data.guildId);
	if (!guild) {
		locked.delete(data.guildId);
		return;
	}

	const persisted = await getPersistedRaidLock(data.guildId).catch(() => null);
	// New-generation tasks carry unlockAt. If state was manually cleared, or a
	// newer lockdown replaced it, this task is stale and must not touch the guild.
	if (data.unlockAt !== undefined) {
		if (!persisted || persisted.unlockAt !== data.unlockAt) return;
	}

	const restoreLevel = (
		data.restoreLevel ??
		persisted?.restoreLevel ??
		GuildVerificationLevel.Low
	) as GuildVerificationLevel;
	const lifted = await liftLockdown(guild, restoreLevel);
	if (lifted) await clearPersistedRaidLock(data.guildId).catch(() => {});
}
