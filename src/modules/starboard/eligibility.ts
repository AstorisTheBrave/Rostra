/**
 * Pure starboard eligibility + appearance engine: blacklist/whitelist resolution,
 * message filters, net star counting (upvotes minus downvotes), display tiers, and
 * per-context override resolution. All deterministic and unit-tested; the event
 * handler supplies the live Discord data.
 */

export interface AccessLists {
	blacklistUsers: string[];
	blacklistRoles: string[];
	blacklistChannels: string[];
	whitelistUsers: string[];
	whitelistRoles: string[];
	whitelistChannels: string[];
}

export interface AccessContext {
	userId: string;
	roleIds: string[];
	channelId: string;
}

/**
 * Whether a user/message is allowed past the blacklist. Specificity wins, and a
 * more specific whitelist beats a less specific blacklist: user > role > channel.
 * At each tier a whitelist entry allows and a blacklist entry blocks.
 */
export function isAllowed(ctx: AccessContext, lists: AccessLists): boolean {
	if (lists.whitelistUsers.includes(ctx.userId)) return true;
	if (lists.blacklistUsers.includes(ctx.userId)) return false;
	if (ctx.roleIds.some((r) => lists.whitelistRoles.includes(r))) return true;
	if (ctx.roleIds.some((r) => lists.blacklistRoles.includes(r))) return false;
	if (lists.whitelistChannels.includes(ctx.channelId)) return true;
	if (lists.blacklistChannels.includes(ctx.channelId)) return false;
	return true;
}

// ── Message filters ──────────────────────────────────────────────────────────

export interface FilterSettings {
	minChars: number;
	minAttachments: number;
	requireImage: boolean;
	maxMessageAgeHours: number; // 0 = no limit
	requireNsfwChannel: boolean;
}

export interface MessageFacts {
	contentLength: number;
	attachmentCount: number;
	hasImage: boolean;
	ageMs: number; // now - message.createdAt at star time
	channelNsfw: boolean;
}

/** Whether a message passes a board's content/attachment/age/channel filters. */
export function passesFilters(facts: MessageFacts, f: FilterSettings): boolean {
	if (facts.contentLength < f.minChars) return false;
	if (facts.attachmentCount < f.minAttachments) return false;
	if (f.requireImage && !facts.hasImage) return false;
	if (f.maxMessageAgeHours > 0 && facts.ageMs > f.maxMessageAgeHours * 3_600_000) return false;
	if (f.requireNsfwChannel && !facts.channelNsfw) return false;
	return true;
}

// ── Net star counting ────────────────────────────────────────────────────────

export interface Reactor {
	id: string;
	bot: boolean;
	roleIds: string[];
}

/**
 * Net star count for a board: each valid upvote adds 1, each valid downvote
 * subtracts 1, floored at 0. A reactor is valid when not a filtered bot, not the
 * author (unless self-stars), and not blacklisted.
 */
export function netStars(opts: {
	upvoters: Reactor[];
	downvoters: Reactor[];
	authorId: string;
	selfStar: boolean;
	filterBots: boolean;
	lists: AccessLists;
}): number {
	const valid = (r: Reactor): boolean => {
		if (opts.filterBots && r.bot) return false;
		if (!opts.selfStar && r.id === opts.authorId) return false;
		return isAllowed({ userId: r.id, roleIds: r.roleIds, channelId: "" }, opts.lists);
	};
	const up = opts.upvoters.filter(valid).length;
	const down = opts.downvoters.filter(valid).length;
	return Math.max(0, up - down);
}

// ── Display tiers ────────────────────────────────────────────────────────────

export interface DisplayTier {
	minStars: number;
	emoji: string;
}

/** Pick the emoji for the highest display tier whose `minStars` the count meets. */
export function tierEmoji(stars: number, tiers: DisplayTier[], fallback: string): string {
	let best: DisplayTier | null = null;
	for (const tier of tiers) {
		if (stars >= tier.minStars && (!best || tier.minStars > best.minStars)) best = tier;
	}
	return best?.emoji ?? fallback;
}

/** Parse a "5:⭐ 10:🌟 25:💫" style string into sorted display tiers. */
export function parseDisplayTiers(input: string): DisplayTier[] {
	const tiers: DisplayTier[] = [];
	for (const part of input.split(/[\s,]+/).filter(Boolean)) {
		const [num, emoji] = part.split(":");
		const minStars = Number(num);
		if (Number.isFinite(minStars) && emoji) tiers.push({ minStars, emoji });
	}
	return tiers.sort((a, b) => a.minStars - b.minStars);
}

// ── Override resolution ──────────────────────────────────────────────────────

export interface OverridableSettings {
	requiredStars: number;
	removeStars: number | null;
	selfStar: boolean;
	filterBots: boolean;
}

export interface OverrideRule {
	scopeType: string; // "channel" | "role"
	scopeIds: string[];
	enabled: boolean;
	requiredStars: number | null;
	removeStars: number | null;
	selfStar: boolean | null;
	filterBots: boolean | null;
}

/**
 * Resolve the effective settings for a message context. Overrides inherit from
 * the board base; matching role overrides apply first, then the more-specific
 * channel overrides, so channel scope wins on conflict. Only non-null fields
 * override.
 */
export function resolveSettings(
	base: OverridableSettings,
	overrides: OverrideRule[],
	ctx: { channelId: string; roleIds: string[] },
): OverridableSettings {
	const result = { ...base };
	const apply = (o: OverrideRule): void => {
		if (o.requiredStars !== null) result.requiredStars = o.requiredStars;
		if (o.removeStars !== null) result.removeStars = o.removeStars;
		if (o.selfStar !== null) result.selfStar = o.selfStar;
		if (o.filterBots !== null) result.filterBots = o.filterBots;
	};
	const matches = overrides.filter((o) => {
		if (!o.enabled) return false;
		if (o.scopeType === "channel") return o.scopeIds.includes(ctx.channelId);
		if (o.scopeType === "role") return ctx.roleIds.some((r) => o.scopeIds.includes(r));
		return false;
	});
	// role first, then channel (more specific) so channel wins on conflict.
	for (const o of matches.filter((m) => m.scopeType === "role")) apply(o);
	for (const o of matches.filter((m) => m.scopeType === "channel")) apply(o);
	return result;
}
