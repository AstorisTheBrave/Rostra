import type { AutomodConfig, AutomodRule } from "@prisma/client";
import { Filter } from "bad-words";
import { type Message, MessageFlags } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { hasDisallowedLink, hasInvite, isCapsAbuse } from "./checks.ts";

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

export type Violation = { type: string; reason: string } | null;

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

	if (config.antiInvite && hasInvite(content)) {
		return { type: "invite", reason: "Posted a server invite" };
	}
	if (config.antiLink && hasDisallowedLink(content, config.allowedLinks)) {
		return { type: "link", reason: "Posted a disallowed link" };
	}
	if (config.antiMassMention && message.mentions.users.size > config.mentionLimit) {
		return { type: "mention", reason: "Mass mentioning members" };
	}
	if (config.antiCaps && isCapsAbuse(content, config.capsPercent, config.capsMinLength)) {
		return { type: "caps", reason: "Excessive capitalisation" };
	}
	if (config.antiProfanity && content && getFilter(config).isProfane(content)) {
		return { type: "profanity", reason: "Profanity" };
	}
	if (config.antiSpam) {
		const key = `${config.guildId}:${message.author.id}`;
		if (trackSpam(key, config.spamCount, config.spamWindowMs)) {
			return { type: "spam", reason: "Spamming messages" };
		}
	}
	return null;
}

/** Delete the offending message, apply the action (rule override or config default), and log it. */
export async function enforce(
	message: Message,
	config: AutomodConfig,
	violation: { type: string; reason: string },
	actionOverride?: string,
): Promise<void> {
	const action = actionOverride ?? config.action;
	if (message.deletable) await message.delete().catch(() => {});

	if (action === "timeout" && message.member?.moderatable) {
		await message.member.timeout(config.timeoutMs, `[Automod] ${violation.reason}`).catch(() => {});
	}

	if (config.logChannelId) {
		const channel = await message.guild?.channels.fetch(config.logChannelId).catch(() => null);
		if (channel?.isTextBased()) {
			const block = container(Accent.warn, [
				text("## 🧹 Automod"),
				text(
					`**User:** ${message.author.tag} (\`${message.author.id}\`)\n**Rule:** ${violation.type}\n**Reason:** ${violation.reason}`,
				),
			]);
			await channel
				.send({ components: [block], flags: MessageFlags.IsComponentsV2 })
				.catch(() => {});
		}
	}
}
