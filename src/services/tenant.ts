import type { GuildTenant, Prisma } from "@prisma/client";
import { cachedConfig, invalidateConfig } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";

/**
 * Centralized per-guild config ("tenant"). Reads come from a two-layer cache:
 * L1 is a per-shard in-process map of hot guilds; L2 is Redis at the 5-minute
 * config TTL; a miss loads (and lazily creates) the row from Postgres. Writes go
 * through `updateTenant`, which invalidates both layers so config never goes
 * stale. Guilds are owned by a single shard, so the L1 map needs no cross-shard
 * invalidation.
 */

const L1 = new Map<string, GuildTenant>();
const L1_MAX = 1000;
const cacheKey = (guildId: string) => `tenant:${guildId}`;

function rememberL1(guildId: string, tenant: GuildTenant): void {
	if (L1.size >= L1_MAX) {
		const oldest = L1.keys().next().value;
		if (oldest !== undefined) L1.delete(oldest);
	}
	L1.set(guildId, tenant);
}

/** Drop a guild from the in-process cache (e.g. on leave). */
export function evictTenantL1(guildId: string): void {
	L1.delete(guildId);
}

function loadOrCreate(guildId: string): Promise<GuildTenant> {
	return getPrisma().guildTenant.upsert({
		where: { guildId },
		create: { guildId },
		update: {},
	});
}

/** Cached per-guild tenant: L1 in-process, then L2 Redis (5-min TTL), then DB. */
export async function getTenant(guildId: string): Promise<GuildTenant> {
	const hot = L1.get(guildId);
	if (hot) return hot;
	const tenant = await cachedConfig(cacheKey(guildId), () => loadOrCreate(guildId));
	rememberL1(guildId, tenant);
	return tenant;
}

export interface TenantPatch {
	locale?: string;
	logChannelId?: string | null;
	modLogChannelId?: string | null;
	welcomeChannelId?: string | null;
	muteRoleId?: string | null;
	features?: Record<string, boolean>;
	settings?: Record<string, unknown>;
}

/** Write tenant fields and invalidate both cache layers. */
export async function updateTenant(guildId: string, patch: TenantPatch): Promise<GuildTenant> {
	const data: Omit<Prisma.GuildTenantUncheckedCreateInput, "guildId"> = {
		...(patch.locale !== undefined ? { locale: patch.locale } : {}),
		...(patch.logChannelId !== undefined ? { logChannelId: patch.logChannelId } : {}),
		...(patch.modLogChannelId !== undefined ? { modLogChannelId: patch.modLogChannelId } : {}),
		...(patch.welcomeChannelId !== undefined ? { welcomeChannelId: patch.welcomeChannelId } : {}),
		...(patch.muteRoleId !== undefined ? { muteRoleId: patch.muteRoleId } : {}),
		...(patch.features !== undefined ? { features: patch.features } : {}),
		...(patch.settings !== undefined ? { settings: patch.settings as Prisma.InputJsonValue } : {}),
	};
	const updated = await getPrisma().guildTenant.upsert({
		where: { guildId },
		create: { guildId, ...data },
		update: data,
	});
	await invalidateConfig(cacheKey(guildId));
	rememberL1(guildId, updated);
	return updated;
}

/** The raw three-state feature flag: true / false / undefined (unset). */
export function tenantFeature(tenant: GuildTenant, feature: string): boolean | undefined {
	const map = tenant.features as Record<string, unknown> | null;
	const value = map?.[feature];
	return typeof value === "boolean" ? value : undefined;
}

/** Whether a feature flag is explicitly enabled on the tenant. */
export function isFeatureEnabled(tenant: GuildTenant, feature: string): boolean {
	return tenantFeature(tenant, feature) === true;
}

/**
 * Master override check for a guild feature. Returns true only when an admin has
 * explicitly turned the feature OFF in the setup wizard (flag === false). When
 * the flag is unset or true, the module's own config governs - so this is a safe
 * kill-switch that never changes default behaviour. Reads through the tenant
 * cache, so it is cheap on hot event paths.
 */
export async function isFeatureBlocked(guildId: string, feature: string): Promise<boolean> {
	const tenant = await getTenant(guildId);
	return tenantFeature(tenant, feature) === false;
}

/** Read a free-form setting from the tenant. */
export function getSetting<T = unknown>(tenant: GuildTenant, key: string): T | undefined {
	const map = tenant.settings as Record<string, unknown> | null;
	return map?.[key] as T | undefined;
}

/** Merge feature flags into the tenant and persist. */
export async function setFeatures(
	guildId: string,
	flags: Record<string, boolean>,
): Promise<GuildTenant> {
	const current = await getTenant(guildId);
	const merged = { ...((current.features as Record<string, boolean> | null) ?? {}), ...flags };
	return updateTenant(guildId, { features: merged });
}
