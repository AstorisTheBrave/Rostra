import type { Client, Guild, GuildMember, Role, User } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { type CaseType, recordCase } from "@/services/moderationCase.ts";
import { schedule } from "@/services/scheduler.ts";

const log = getLogger("moderation");

export type { CaseType };

export type ModResult =
	| { ok: true; caseNumber?: number }
	| { ok: false; messageKey: string; vars?: Record<string, string | number> };

interface CreateCaseInput {
	guildId: string;
	type: CaseType;
	targetId: string;
	moderatorId: string;
	reason?: string;
	durationMs?: number;
}

/** Create a moderation case with a per-guild sequential case number. */
export async function createCase(input: CreateCaseInput): Promise<number> {
	return recordCase(input);
}

/** A moderator may not act on a target with an equal or higher top role (unless guild owner). */
function checkHierarchy(moderator: GuildMember, target: GuildMember): ModResult {
	if (moderator.guild.ownerId === moderator.id) return { ok: true };
	if (moderator.roles.highest.position <= target.roles.highest.position) {
		return { ok: false, messageKey: "moderation:error.targetHigher" };
	}
	return { ok: true };
}

/** The bot may not act on a target with an equal or higher top role than itself. */
function checkBotHierarchy(target: GuildMember): ModResult {
	const me = target.guild.members.me;
	if (!me) return { ok: false, messageKey: "moderation:error.botNotInGuild" };
	if (me.roles.highest.position <= target.roles.highest.position) {
		return { ok: false, messageKey: "moderation:error.botTargetHigher" };
	}
	return { ok: true };
}

export async function banUser(opts: {
	guild: Guild;
	target: User;
	moderator: GuildMember;
	reason: string;
	deleteSeconds?: number;
}): Promise<ModResult> {
	const member = await opts.guild.members.fetch(opts.target.id).catch(() => null);
	if (member) {
		const bot = checkBotHierarchy(member);
		if (!bot.ok) return bot;
		const mod = checkHierarchy(opts.moderator, member);
		if (!mod.ok) return mod;
	}
	try {
		await opts.guild.members.ban(opts.target.id, {
			reason: opts.reason,
			deleteMessageSeconds: opts.deleteSeconds ?? 0,
		});
	} catch (err) {
		log.error({ err }, "ban failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.guild.id,
		type: "ban",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

export async function unbanUser(opts: {
	guild: Guild;
	targetId: string;
	moderator: GuildMember;
	reason: string;
}): Promise<ModResult> {
	const ban = await opts.guild.bans.fetch(opts.targetId).catch(() => null);
	if (!ban) return { ok: false, messageKey: "moderation:error.notBanned" };
	try {
		await opts.guild.members.unban(opts.targetId, opts.reason);
	} catch (err) {
		log.error({ err }, "unban failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.guild.id,
		type: "unban",
		targetId: opts.targetId,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

export async function kickUser(opts: {
	target: GuildMember;
	moderator: GuildMember;
	reason: string;
}): Promise<ModResult> {
	const bot = checkBotHierarchy(opts.target);
	if (!bot.ok) return bot;
	const mod = checkHierarchy(opts.moderator, opts.target);
	if (!mod.ok) return mod;
	if (!opts.target.kickable) return { ok: false, messageKey: "moderation:error.notKickable" };
	try {
		await opts.target.kick(opts.reason);
	} catch (err) {
		log.error({ err }, "kick failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.target.guild.id,
		type: "kick",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

export async function timeoutUser(opts: {
	target: GuildMember;
	moderator: GuildMember;
	durationMs: number;
	reason: string;
}): Promise<ModResult> {
	const bot = checkBotHierarchy(opts.target);
	if (!bot.ok) return bot;
	const mod = checkHierarchy(opts.moderator, opts.target);
	if (!mod.ok) return mod;
	if (!opts.target.moderatable) return { ok: false, messageKey: "moderation:error.notModeratable" };
	try {
		await opts.target.timeout(opts.durationMs, opts.reason);
	} catch (err) {
		log.error({ err }, "timeout failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.target.guild.id,
		type: "timeout",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
		durationMs: opts.durationMs,
	});
	return { ok: true, caseNumber };
}

export async function removeTimeout(opts: {
	target: GuildMember;
	moderator: GuildMember;
	reason: string;
}): Promise<ModResult> {
	if (!opts.target.moderatable) return { ok: false, messageKey: "moderation:error.notModeratable" };
	if (!opts.target.isCommunicationDisabled()) {
		return { ok: false, messageKey: "moderation:error.notTimedOut" };
	}
	try {
		await opts.target.timeout(null, opts.reason);
	} catch (err) {
		log.error({ err }, "untimeout failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.target.guild.id,
		type: "untimeout",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

export async function warnUser(opts: {
	guildId: string;
	targetId: string;
	moderatorId: string;
	reason: string;
}): Promise<ModResult> {
	const caseNumber = await createCase({
		guildId: opts.guildId,
		type: "warn",
		targetId: opts.targetId,
		moderatorId: opts.moderatorId,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

export async function addNote(opts: {
	guildId: string;
	targetId: string;
	moderatorId: string;
	reason: string;
}): Promise<ModResult> {
	const caseNumber = await createCase({
		guildId: opts.guildId,
		type: "note",
		targetId: opts.targetId,
		moderatorId: opts.moderatorId,
		reason: opts.reason,
	});
	return { ok: true, caseNumber };
}

/** Add a role to a member and schedule its durable removal after `durationMs`. */
export async function applyTempRole(opts: {
	guild: Guild;
	target: GuildMember;
	moderator: GuildMember;
	role: Role;
	durationMs: number;
	reason: string;
	client: Client;
}): Promise<ModResult> {
	const me = opts.guild.members.me;
	if (!me) return { ok: false, messageKey: "moderation:error.botNotInGuild" };
	if (opts.role.managed || me.roles.highest.position <= opts.role.position) {
		return { ok: false, messageKey: "moderation:error.roleTooHigh" };
	}
	const mod = checkHierarchy(opts.moderator, opts.target);
	if (!mod.ok) return mod;
	try {
		await opts.target.roles.add(opts.role, opts.reason);
	} catch (err) {
		log.error({ err }, "temprole add failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.guild.id,
		type: "temprole",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
		durationMs: opts.durationMs,
	});
	await schedule(
		{
			type: "temprole_remove",
			runAt: new Date(Date.now() + opts.durationMs),
			guildId: opts.guild.id,
			payload: { guildId: opts.guild.id, userId: opts.target.id, roleId: opts.role.id },
		},
		opts.client,
	);
	return { ok: true, caseNumber };
}

/** Durable-scheduler handler: remove a temporary role when it expires. */
export async function removeTempRoleTask(payload: unknown, client: Client): Promise<void> {
	const p = payload as { guildId?: string; userId?: string; roleId?: string };
	if (!p.guildId || !p.userId || !p.roleId) return;
	const guild = client.guilds.cache.get(p.guildId);
	if (!guild) return;
	const member = await guild.members.fetch(p.userId).catch(() => null);
	await member?.roles.remove(p.roleId, "Temporary role expired").catch(() => {});
}

/** Ban a user and schedule a durable auto-unban after `durationMs`. */
export async function applyTempBan(opts: {
	guild: Guild;
	target: User;
	moderator: GuildMember;
	durationMs: number;
	reason: string;
	deleteSeconds?: number;
	client: Client;
}): Promise<ModResult> {
	const member = await opts.guild.members.fetch(opts.target.id).catch(() => null);
	if (member) {
		const bot = checkBotHierarchy(member);
		if (!bot.ok) return bot;
		const mod = checkHierarchy(opts.moderator, member);
		if (!mod.ok) return mod;
	}
	try {
		await opts.guild.members.ban(opts.target.id, {
			reason: opts.reason,
			deleteMessageSeconds: opts.deleteSeconds ?? 0,
		});
	} catch (err) {
		log.error({ err }, "tempban failed");
		return { ok: false, messageKey: "moderation:error.actionFailed" };
	}
	const caseNumber = await createCase({
		guildId: opts.guild.id,
		type: "ban",
		targetId: opts.target.id,
		moderatorId: opts.moderator.id,
		reason: opts.reason,
		durationMs: opts.durationMs,
	});
	await schedule(
		{
			type: "tempban_lift",
			runAt: new Date(Date.now() + opts.durationMs),
			guildId: opts.guild.id,
			payload: { guildId: opts.guild.id, userId: opts.target.id },
		},
		opts.client,
	);
	return { ok: true, caseNumber };
}

/** Durable-scheduler handler: unban a user when their temp-ban expires. */
export async function liftTempBanTask(payload: unknown, client: Client): Promise<void> {
	const p = payload as { guildId?: string; userId?: string };
	if (!p.guildId || !p.userId) return;
	const guild = client.guilds.cache.get(p.guildId);
	if (!guild) return;
	await guild.members.unban(p.userId, "Temporary ban expired").catch(() => {});
}

/** All cases for a target (optionally filtered by type), newest first. */
export async function getCases(guildId: string, targetId: string, type?: CaseType) {
	const prisma = getPrisma();
	return prisma.moderationCase.findMany({
		where: { guildId, targetId, ...(type ? { type } : {}), active: true },
		orderBy: { caseNumber: "desc" },
		take: 25,
	});
}

/** A single case by its per-guild number, or null. */
export async function getCase(guildId: string, caseNumber: number) {
	return getPrisma().moderationCase.findUnique({
		where: { guildId_caseNumber: { guildId, caseNumber } },
	});
}

/** One moderator's active-case counts broken down by action type, busiest first. */
export async function getModeratorBreakdown(
	guildId: string,
	moderatorId: string,
): Promise<{ type: string; count: number }[]> {
	const grouped = await getPrisma().moderationCase.groupBy({
		by: ["type"],
		where: { guildId, moderatorId, active: true },
		_count: { _all: true },
	});
	return grouped
		.map((g) => ({ type: g.type, count: g._count._all }))
		.sort((a, b) => b.count - a.count);
}

/** Top moderators in a guild by active-case count (includes AUTOMOD). */
export async function getModeratorLeaderboard(
	guildId: string,
	limit = 10,
): Promise<{ moderatorId: string; count: number }[]> {
	const grouped = await getPrisma().moderationCase.groupBy({
		by: ["moderatorId"],
		where: { guildId, active: true },
		_count: { _all: true },
	});
	return grouped
		.map((g) => ({ moderatorId: g.moderatorId, count: g._count._all }))
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

/** Mark a case inactive (used to remove a warning). Returns whether it existed. */
export async function deactivateCase(guildId: string, caseNumber: number): Promise<boolean> {
	const prisma = getPrisma();
	const existing = await prisma.moderationCase.findUnique({
		where: { guildId_caseNumber: { guildId, caseNumber } },
	});
	if (!existing) return false;
	await prisma.moderationCase.update({
		where: { guildId_caseNumber: { guildId, caseNumber } },
		data: { active: false },
	});
	return true;
}
