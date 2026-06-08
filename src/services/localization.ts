import type { Guild, UserPreference } from "@prisma/client";
import { getTranslator, type Translator } from "@/i18n/index.ts";
import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/locales.ts";
import { cachedConfig, invalidateConfig } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getTenant, updateTenant } from "@/services/tenant.ts";

/**
 * The localization platform service - peer to `tenant`. Resolves which language
 * a given audience should be addressed in (user / guild / moderator) and exposes
 * locale-bound translators so a single action can render per recipient. Also owns
 * per-user preferences (language + feature opt-outs). User prefs read through the
 * shared two-layer config cache (Redis, 5-min TTL), like tenant config.
 */

// ── Feature opt-outs ─────────────────────────────────────────────────────────

/** Personal features a user may opt out of. Default = opted in. */
export type UserFeature =
	| "fun" // ship / fight / roleplay and similar social commands
	| "dmNotifications" // warnings, appeals, and other bot DMs
	| "profilePublic" // others may view your profile card
	| "reputationPublic" // appear on the reputation leaderboard
	| "matchmaking" // social/matchmaking features
	| "achievementNotifications";

const L1 = new Map<string, UserPreference>();
const L1_MAX = 5000;
const cacheKey = (userId: string) => `userpref:${userId}`;

function rememberL1(userId: string, pref: UserPreference): void {
	if (L1.size >= L1_MAX) {
		const oldest = L1.keys().next().value;
		if (oldest !== undefined) L1.delete(oldest);
	}
	L1.set(userId, pref);
}

function loadOrCreate(userId: string): Promise<UserPreference> {
	return getPrisma().userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Cached per-user preferences: L1 in-process, then Redis (5-min), then DB. */
export async function getUserPreference(userId: string): Promise<UserPreference> {
	const hot = L1.get(userId);
	if (hot) return hot;
	const pref = await cachedConfig(cacheKey(userId), () => loadOrCreate(userId));
	rememberL1(userId, pref);
	return pref;
}

async function writePreference(
	userId: string,
	data: { locale?: string | null; features?: Record<string, boolean> },
): Promise<UserPreference> {
	const updated = await getPrisma().userPreference.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data,
	});
	await invalidateConfig(cacheKey(userId));
	rememberL1(userId, updated);
	return updated;
}

/** Set (or clear, with null) a user's preferred language. */
export function setUserLocale(userId: string, locale: string | null): Promise<UserPreference> {
	return writePreference(userId, { locale: locale ? (normalizeLocale(locale) ?? null) : null });
}

/** Toggle a feature opt-in/out (enabled=false means opted out). */
export async function setUserFeature(
	userId: string,
	feature: UserFeature,
	enabled: boolean,
): Promise<UserPreference> {
	const pref = await getUserPreference(userId);
	const features = {
		...((pref.features as Record<string, boolean> | null) ?? {}),
		[feature]: enabled,
	};
	return writePreference(userId, { features });
}

/** Whether a user has opted out of a feature (default = opted in). */
export async function isOptedOut(userId: string, feature: UserFeature): Promise<boolean> {
	const pref = await getUserPreference(userId);
	const features = pref.features as Record<string, unknown> | null;
	return features?.[feature] === false;
}

/** Drop a user's preference from the in-process cache (e.g. after a write elsewhere). */
export function evictUserPreferenceL1(userId: string): void {
	L1.delete(userId);
}

// ── Locale resolution ────────────────────────────────────────────────────────

export type LocaleScope = "user" | "guild" | "actor";

export interface ResolveOpts {
	userId?: string;
	guildId?: string;
	interactionLocale?: string | null; // Discord client locale from the interaction
	scope: LocaleScope;
}

/**
 * Resolve the locale for an audience.
 * - guild scope: guild language, else English.
 * - user / actor scope: explicit user preference, else the Discord client locale,
 *   else the guild language, else English.
 */
export async function resolveLocale(opts: ResolveOpts): Promise<string> {
	const guildLocale = opts.guildId
		? (normalizeLocale((await getTenant(opts.guildId)).locale) ?? DEFAULT_LOCALE)
		: DEFAULT_LOCALE;
	if (opts.scope === "guild") return guildLocale;

	if (opts.userId) {
		const pref = await getUserPreference(opts.userId);
		const explicit = normalizeLocale(pref.locale);
		if (explicit) return explicit;
	}
	return normalizeLocale(opts.interactionLocale) ?? guildLocale;
}

/** Set a guild's language (used by `/setup language`). */
export function setGuildLocale(guildId: string, locale: string): Promise<unknown> {
	return updateTenant(guildId, { locale: normalizeLocale(locale) ?? DEFAULT_LOCALE });
}

// ── Multi-audience helper ────────────────────────────────────────────────────

export interface ActionTranslators {
	actorT: Translator;
	targetT: Translator;
	guildT: Translator;
	actorLocale: string;
	targetLocale: string;
	guildLocale: string;
}

/**
 * Build the three translators a moderation/automod action needs so each recipient
 * is addressed in their own language: the acting moderator, the target user, and
 * the public guild log.
 */
export async function localizeAction(opts: {
	guild: Guild;
	actorId: string;
	targetId: string;
	interactionLocale?: string | null;
}): Promise<ActionTranslators> {
	const [actorLocale, targetLocale, guildLocale] = await Promise.all([
		resolveLocale({
			userId: opts.actorId,
			guildId: opts.guild.id,
			interactionLocale: opts.interactionLocale,
			scope: "actor",
		}),
		resolveLocale({ userId: opts.targetId, guildId: opts.guild.id, scope: "user" }),
		resolveLocale({ guildId: opts.guild.id, scope: "guild" }),
	]);
	return {
		actorLocale,
		targetLocale,
		guildLocale,
		actorT: getTranslator(actorLocale),
		targetT: getTranslator(targetLocale),
		guildT: getTranslator(guildLocale),
	};
}
