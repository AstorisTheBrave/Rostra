import type { Guild, GuildMember, User } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("moderation");

export type CaseType = "ban" | "kick" | "timeout" | "untimeout" | "unban" | "warn" | "note";

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
	const prisma = getPrisma();
	return prisma.$transaction(async (tx) => {
		const counter = await tx.guildCaseCounter.upsert({
			where: { guildId: input.guildId },
			create: { guildId: input.guildId, count: 1 },
			update: { count: { increment: 1 } },
		});
		const caseNumber = counter.count;
		await tx.moderationCase.create({
			data: {
				guildId: input.guildId,
				caseNumber,
				type: input.type,
				targetId: input.targetId,
				moderatorId: input.moderatorId,
				reason: input.reason ?? null,
				durationMs: input.durationMs ?? null,
			},
		});
		return caseNumber;
	});
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

/** All cases for a target (optionally filtered by type), newest first. */
export async function getCases(guildId: string, targetId: string, type?: CaseType) {
	const prisma = getPrisma();
	return prisma.moderationCase.findMany({
		where: { guildId, targetId, ...(type ? { type } : {}), active: true },
		orderBy: { caseNumber: "desc" },
		take: 25,
	});
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
