import type { AutomodConfig, AutomodRule } from "@prisma/client";
import { Filter } from "bad-words";
import { type Message, MessageFlags } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { type CaseType, recordCase } from "@/services/moderationCase.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { hasDisallowedLink, hasHateSpeech, hasInvite, isCapsAbuse } from "./checks.ts";
import {
	type AutomodAction,
	type EscalationResult,
	resolveEscalation,
	type Severity,
} from "./escalation.ts";

const log = getLogger("automod");

const configCache = new Map<string, AutomodConfig | null>();
const filterCache = new Map<string, Filter>();
const rulesCache = new Map<string, AutomodRule[]>();
const spamBuckets = new Map<string, number[]>();

export async function getConfig(guildId: string): Promise<AutomodConfig | null> {
	const cached = configCache.get(guildId);
	if (cached !== undefined) return cached;
	const cfg = await getPrisma()
		.automodConfig.findUnique({ where: { guildId } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load automod config");
			return null;
		});
	configCache.set(guildId, cfg);
	return cfg;
}

export async function upsertConfig(
	guildId: string,
	data: Partial<Omit<AutomodConfig, "guildId" | "createdAt" | "updatedAt">>,
): Promise<AutomodConfig> {
	const cfg = await getPrisma().automodConfig.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	configCache.set(guildId, cfg);
	filterCache.delete(guildId);
	return cfg;
}

export function invalidate(guildId: string): void {
	configCache.delete(guildId);
	filterCache.delete(guildId);
	rulesCache.delete(guildId);
}

// ── Custom rules ─────────────────────────────────────────────────────────────

/** Cached list of a guild's custom automod rules. */
export async function getRules(guildId: string): Promise<AutomodRule[]> {
	const cached = rulesCache.get(guildId);
	if (cached) return cached;
	const rows = await getPrisma()
		.automodRule.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } })
		.catch((err) => {
			log.error({ err, guildId }, "failed to load automod rules");
			return [] as AutomodRule[];
		});
	rulesCache.set(guildId, rows);
	return rows;
}

export async function addRule(data: {
	guildId: string;
	name: string;
	trigger: string;
	pattern: string;
	action: string;
}): Promise<AutomodRule> {
	const row = await getPrisma().automodRule.upsert({
		where: { guildId_name: { guildId: data.guildId, name: data.name } },
		create: data,
		update: { trigger: data.trigger, pattern: data.pattern, action: data.action, enabled: true },
	});
	rulesCache.delete(data.guildId);
	return row;
}

export async function removeRule(guildId: string, name: string): Promise<boolean> {
	const res = await getPrisma().automodRule.deleteMany({ where: { guildId, name } });
	rulesCache.delete(guildId);
	return res.count > 0;
}

export async function toggleRule(guildId: string, name: string): Promise<AutomodRule | null> {
	const rule = await getPrisma().automodRule.findUnique({
		where: { guildId_name: { guildId, name } },
	});
	if (!rule) return null;
	const updated = await getPrisma().automodRule.update({
		where: { guildId_name: { guildId, name } },
		data: { enabled: !rule.enabled },
	});
	rulesCache.delete(guildId);
	return updated;
}

function getFilter(config: AutomodConfig): Filter {
	let filter = filterCache.get(config.guildId);
	if (!filter) {
		filter = new Filter();
		if (config.customWords.length) filter.addWords(...config.customWords);
		filterCache.set(config.guildId, filter);
	}
	return filter;
}

export type Violation = { type: string; reason: string; severity: Severity } | null;

export function isExempt(message: Message, config: AutomodConfig): boolean {
	if (config.exemptChannels.includes(message.channelId)) return true;
	const roles = message.member?.roles.cache;
	if (roles && config.exemptRoles.some((r) => roles.has(r))) return true;
	return false;
}

function trackSpam(key: string, count: number, windowMs: number): boolean {
	const now = Date.now();
	const bucket = (spamBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
	bucket.push(now);
	spamBuckets.set(key, bucket);
	return bucket.length > count;
}

/** Evaluate a message against the guild's automod rules. Returns the first violation or null. */
export function checkMessage(message: Message, config: AutomodConfig): Violation {
	if (!config.enabled || isExempt(message, config)) return null;
	const content = message.content;

	if (config.antiHate && content && hasHateSpeech(content)) {
		return { type: "hate", reason: "Hate speech or slur", severity: "HIGH" };
	}
	if (config.antiMassMention && message.mentions.users.size > config.mentionLimit) {
		return { type: "mention", reason: "Mass mentioning members", severity: "MEDIUM" };
	}
	if (config.antiInvite && hasInvite(content)) {
		return { type: "invite", reason: "Posted a server invite", severity: "LOW" };
	}
	if (config.antiLink && hasDisallowedLink(content, config.allowedLinks)) {
		return { type: "link", reason: "Posted a disallowed link", severity: "LOW" };
	}
	if (config.antiCaps && isCapsAbuse(content, config.capsPercent, config.capsMinLength)) {
		return { type: "caps", reason: "Excessive capitalisation", severity: "LOW" };
	}
	if (config.antiProfanity && content && getFilter(config).isProfane(content)) {
		return { type: "profanity", reason: "Profanity", severity: "LOW" };
	}
	if (config.antiSpam) {
		const key = `${config.guildId}:${message.author.id}`;
		if (trackSpam(key, config.spamCount, config.spamWindowMs)) {
			return { type: "spam", reason: "Spamming messages", severity: "LOW" };
		}
	}
	return null;
}

function severityFrom(value: string): Severity {
	return value === "HIGH" || value === "MEDIUM" ? value : "LOW";
}

/** Prior active automod offenses for a user, as severities (drives escalation). */
async function priorSeverities(guildId: string, userId: string): Promise<Severity[]> {
	const rows = await getPrisma()
		.automodWarning.findMany({
			where: { guildId, userId, active: true },
			select: { severity: true },
		})
		.catch((err) => {
			log.error({ err, guildId }, "failed to load automod warnings");
			return [] as { severity: string }[];
		});
	return rows.map((r) => severityFrom(r.severity));
}

const ACTION_LABEL: Record<AutomodAction, string> = {
	WARN: "Warning",
	TIMEOUT: "Timeout",
	KICK: "Kick",
	BAN: "Ban",
};

const ACTION_CASE: Record<AutomodAction, CaseType> = {
	WARN: "warn",
	TIMEOUT: "timeout",
	KICK: "kick",
	BAN: "ban",
};

function durationLabel(ms: number | null): string | null {
	if (!ms) return null;
	const hours = Math.round(ms / 3_600_000);
	return hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;
}

/**
 * Enforce automod on a message: delete it, then (when escalation is on) walk the
 * severity-weighted ladder - record the offense, decide warn/timeout/kick/ban from
 * the user's cumulative history, apply it, file a moderation case, DM the user, and
 * log. A first offense never exceeds a timeout.
 */
export async function enforce(
	message: Message,
	config: AutomodConfig,
	violation: { type: string; reason: string; severity: Severity },
): Promise<void> {
	if (!message.inGuild()) return;
	const guildId = message.guild.id;
	const userId = message.author.id;
	if (message.deletable) await message.delete().catch(() => {});

	// Legacy fixed-action mode (escalation disabled): keep the simple behaviour.
	if (!config.escalate) {
		if (config.action === "timeout" && message.member?.moderatable) {
			await message.member
				.timeout(config.timeoutMs, `[Automod] ${violation.reason}`)
				.catch(() => {});
		}
		await logViolation(message, config, violation, null);
		return;
	}

	const prior = await priorSeverities(guildId, userId);
	const result = resolveEscalation(prior, violation.severity);

	await getPrisma()
		.automodWarning.create({
			data: {
				guildId,
				userId,
				severity: violation.severity,
				reason: violation.reason,
				ruleId: violation.type,
				action: result.action,
			},
		})
		.catch((err) => log.error({ err, guildId }, "failed to record automod warning"));

	await applyEscalation(message, result);

	await recordCase({
		guildId,
		type: ACTION_CASE[result.action],
		targetId: userId,
		moderatorId: "AUTOMOD",
		reason: `[Automod] ${violation.reason}`,
		durationMs: result.timeoutMs ?? undefined,
	}).catch((err) => log.error({ err, guildId }, "failed to record automod case"));

	await dmOffender(message, result, violation);
	await logViolation(message, config, violation, result);
}

/** Apply the escalation's Discord action (the message is already deleted). */
async function applyEscalation(message: Message, result: EscalationResult): Promise<void> {
	if (result.action === "WARN" || !message.inGuild()) return;
	const member = await message.guild.members.fetch(message.author.id).catch(() => null);
	if (!member) return;
	const reason = `[Automod] offense #${result.offenseCount}`;
	try {
		if (result.action === "TIMEOUT") {
			if (member.moderatable && result.timeoutMs) await member.timeout(result.timeoutMs, reason);
		} else if (result.action === "KICK") {
			if (member.kickable) await member.kick(reason);
		} else if (result.action === "BAN") {
			if (member.bannable) await message.guild.members.ban(member.id, { reason });
		}
	} catch (err) {
		log.error({ err, action: result.action }, "automod action failed");
	}
}

/** DM the offender a Components V2 notice (best-effort; DMs closed is fine). */
async function dmOffender(
	message: Message,
	result: EscalationResult,
	violation: { reason: string },
): Promise<void> {
	if (!message.inGuild()) return;
	const dur = durationLabel(result.timeoutMs);
	const accent = result.action === "WARN" ? Accent.warn : Accent.error;
	const block = container(accent, [
		text(`## Automod ${ACTION_LABEL[result.action]}${dur ? ` (${dur})` : ""}`),
		text(
			`**Server:** ${message.guild.name}\n**Reason:** ${violation.reason}\n**Offense:** #${result.offenseCount}`,
		),
	]);
	await message.author
		.send({ components: [block], flags: MessageFlags.IsComponentsV2 })
		.catch(() => {});
}

/** Post the automod action to the configured log channel. */
async function logViolation(
	message: Message,
	config: AutomodConfig,
	violation: { type: string; reason: string; severity: Severity },
	result: EscalationResult | null,
): Promise<void> {
	if (!config.logChannelId || !message.inGuild()) return;
	const channel = await message.guild.channels.fetch(config.logChannelId).catch(() => null);
	if (!channel?.isTextBased()) return;
	const dur = result ? durationLabel(result.timeoutMs) : null;
	const actionLine = result
		? `\n**Action:** ${ACTION_LABEL[result.action]}${dur ? ` (${dur})` : ""} - offense #${result.offenseCount}`
		: "";
	const block = container(result && result.action !== "WARN" ? Accent.error : Accent.warn, [
		text("## 🧹 Automod"),
		text(
			`**User:** ${message.author.tag} (\`${message.author.id}\`)\n**Rule:** ${violation.type} (${violation.severity})\n**Reason:** ${violation.reason}${actionLine}`,
		),
	]);
	await channel.send({ components: [block], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}
