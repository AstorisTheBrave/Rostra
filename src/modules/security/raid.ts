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
const operations = new Map<string, Promise<void>>();

/** Serialize lockdown transitions for a guild, including Discord and tenant writes. */
async function withGuildLock<T>(guildId: string, action: () => Promise<T>): Promise<T> {
	const prior = operations.get(guildId) ?? Promise.resolve();
	let release = () => {};
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	operations.set(guildId, next);
	await prior;
	try {
		return await action();
	} finally {
		release();
		if (operations.get(guildId) === next) operations.delete(guildId);
	}
}

export interface PersistedRaidLock {
	active: true;
	restoreLevel: number;
	unlockAt: number;
}

export function isCurrentRaidUnlock(
	unlockAt: number | undefined,
	lock: PersistedRaidLock | null,
): boolean {
	return unlockAt !== undefined && lock?.unlockAt === unlockAt;
}

export function restoreLockLevel(
	panic: number | null,
	raid: PersistedRaidLock | null,
	memory?: GuildVerificationLevel,
): GuildVerificationLevel {
	return (panic ??
		raid?.restoreLevel ??
		memory ??
		GuildVerificationLevel.Low) as GuildVerificationLevel;
}

export function shouldRestoreLockLevel(
	current: GuildVerificationLevel,
	restore: GuildVerificationLevel,
): boolean {
	return current === GuildVerificationLevel.VeryHigh && current !== restore;
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

function panicRestoreLevel(settings: unknown): GuildVerificationLevel | null {
	const value = settingsRecord(settings)[PANIC_SETTING];
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	return record.active === true && typeof record.restoreLevel === "number"
		? (record.restoreLevel as GuildVerificationLevel)
		: null;
}

async function changeLockSettings(
	guildId: string,
	patch: { raid?: PersistedRaidLock | null; panic?: number | null },
): Promise<void> {
	const tenant = await getTenant(guildId);
	const settings = { ...settingsRecord(tenant.settings) };
	if (patch.raid !== undefined) {
		if (patch.raid === null) delete settings[RAID_SETTING];
		else settings[RAID_SETTING] = patch.raid;
	}
	if (patch.panic !== undefined) {
		if (patch.panic === null) delete settings[PANIC_SETTING];
		else settings[PANIC_SETTING] = { active: true, restoreLevel: patch.panic };
	}
	await updateTenant(guildId, { settings });
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
	await changeLockSettings(guildId, { raid: { active: true, restoreLevel, unlockAt } });
}

export async function clearPersistedRaidLock(guildId: string): Promise<void> {
	await changeLockSettings(guildId, { raid: null });
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
	return withGuildLock(guild.id, () => startLockdown(guild, config, client, reason, lockMinutes));
}

async function startLockdown(
	guild: Guild,
	config: AntinukeConfig,
	client: Client,
	reason: string,
	lockMinutes: number,
	manual = false,
): Promise<boolean> {
	if (locked.has(guild.id)) return false;
	if (!manual && lockMinutes <= 0) {
		log.error({ guild: guild.id }, "automatic lockdown requires a positive unlock window");
		return false;
	}
	const tenant = await getTenant(guild.id);
	if (parsePersistedRaidLock(tenant.settings) || hasPersistedPanic(tenant.settings)) return false;

	const restoreLevel = guild.verificationLevel;
	const unlockAt = Date.now() + Math.max(0, lockMinutes) * 60_000;
	if (manual) await changeLockSettings(guild.id, { panic: restoreLevel });
	else await persistRaidLock(guild.id, restoreLevel, unlockAt);
	locked.set(guild.id, restoreLevel);
	try {
		if (!manual && lockMinutes > 0) {
			await schedule(
				{
					type: "raid_unlock",
					runAt: new Date(unlockAt),
					guildId: guild.id,
					payload: { guildId: guild.id, restoreLevel, unlockAt },
				},
				client,
			);
		}
	} catch (err) {
		locked.delete(guild.id);
		await changeLockSettings(guild.id, { raid: null });
		log.error({ err, guild: guild.id }, "could not schedule raid auto-lift");
		return false;
	}
	try {
		if (guild.verificationLevel !== LOCK_LEVEL) {
			await guild.setVerificationLevel(LOCK_LEVEL, "[Anti-raid] lockdown");
		}
	} catch (err) {
		// A timed-out Discord request can still have applied. Preserve the restore
		// state and scheduled recovery until an admin or auto-unlock confirms it.
		log.warn({ err, guild: guild.id }, "verification raise uncertain; lockdown recovery retained");
		return false;
	}

	await alert(
		guild,
		config,
		`${reason}\nVerification raised to **Very High**.${lockMinutes > 0 ? ` Auto-lifts in ${lockMinutes} min.` : " Lift it with `/security panic state:off`."}`,
	);
	return true;
}

export async function manualPanic(
	guild: Guild,
	config: AntinukeConfig,
	client: Client,
): Promise<boolean> {
	return withGuildLock(guild.id, () =>
		startLockdown(guild, config, client, "Manual panic lockdown by an admin.", 0, true),
	);
}

/** Manual recovery on any shard after a restart or failed automatic restore. */
export async function releaseLockdown(guild: Guild): Promise<boolean> {
	return withGuildLock(guild.id, async () => {
		const tenant = await getTenant(guild.id);
		const raid = parsePersistedRaidLock(tenant.settings);
		const panic = panicRestoreLevel(tenant.settings);
		const fallback = restoreLockLevel(panic, raid, locked.get(guild.id));
		if (!locked.has(guild.id) && !raid && panic === null) return true;
		if (!(await liftLockdown(guild, fallback))) return false;
		await changeLockSettings(guild.id, { raid: null, panic: null });
		return true;
	});
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
	const restoreLevel = fallbackLevel ?? locked.get(guild.id) ?? GuildVerificationLevel.Low;
	try {
		// An admin may have changed verification manually while the task was pending.
		if (shouldRestoreLockLevel(guild.verificationLevel, restoreLevel)) {
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
	await withGuildLock(data.guildId, async () => {
		const guild = client.guilds.cache.get(data.guildId as string);
		if (!guild) throw new Error(`Guild ${data.guildId} unavailable for raid unlock`);
		const persisted = await getPersistedRaidLock(data.guildId as string);
		// Legacy tasks lack a generation. They cannot safely unlock a newer lockdown.
		if (!persisted || !isCurrentRaidUnlock(data.unlockAt, persisted)) return;
		if (!(await liftLockdown(guild, persisted.restoreLevel as GuildVerificationLevel))) {
			throw new Error(`Discord rejected raid unlock for ${data.guildId}`);
		}
		await clearPersistedRaidLock(data.guildId as string);
	});
}
