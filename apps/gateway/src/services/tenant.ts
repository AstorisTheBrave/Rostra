import { createCoherentCache } from "@rostra/cache";
import type { GuildTenant, Prisma } from "@rostra/database";
import { getPrisma } from "@rostra/database";

/**
 * Centralized per-guild config ("tenant"). A bounded per-process cache loads
 * misses from Postgres. Writes through `updateTenant` notify other processes;
 * missed invalidations expire within five minutes.
 */
const cache = createCoherentCache<GuildTenant>("tenant", "guild", {
	maxEntries: 1_000,
});

/** Drop a guild from the in-process cache (e.g. on leave). */
export function evictTenantL1(guildId: string): void {
	cache.evict(guildId);
}

function loadOrCreate(guildId: string): Promise<GuildTenant> {
	return getPrisma().guildTenant.upsert({
		where: { guildId },
		create: { guildId },
		update: {},
	});
}

/** Cached per-guild tenant: bounded local L1, then durable PostgreSQL. */
export async function getTenant(guildId: string): Promise<GuildTenant> {
	return cache.get(guildId, () => loadOrCreate(guildId));
}

export interface TenantPatch {
	locale?: string;
	logChannelId?: string | null;
	modLogChannelId?: string | null;
	welcomeChannelId?: string | null;
	muteRoleId?: string | null;
	channelMap?: Record<string, string>;
	features?: Record<string, boolean>;
	settings?: Record<string, unknown>;
}

/** Write tenant fields and publish a post-commit fleet invalidation. */
export async function updateTenant(guildId: string, patch: TenantPatch): Promise<GuildTenant> {
	const data: Omit<Prisma.GuildTenantUncheckedCreateInput, "guildId"> = {
		...(patch.locale !== undefined ? { locale: patch.locale } : {}),
		...(patch.logChannelId !== undefined ? { logChannelId: patch.logChannelId } : {}),
		...(patch.modLogChannelId !== undefined ? { modLogChannelId: patch.modLogChannelId } : {}),
		...(patch.welcomeChannelId !== undefined ? { welcomeChannelId: patch.welcomeChannelId } : {}),
		...(patch.muteRoleId !== undefined ? { muteRoleId: patch.muteRoleId } : {}),
		...(patch.channelMap !== undefined
			? { channelMap: patch.channelMap as Prisma.InputJsonValue }
			: {}),
		...(patch.features !== undefined ? { features: patch.features } : {}),
		...(patch.settings !== undefined ? { settings: patch.settings as Prisma.InputJsonValue } : {}),
	};
	const { value: updated } = await cache.write(guildId, (tx) =>
		tx.guildTenant.upsert({
			where: { guildId },
			create: { guildId, ...data },
			update: data,
		}),
	);
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

/** The tenant's logical-key -> channel/role id registry (written by /setup provision). */
export function getChannelMap(tenant: GuildTenant): Record<string, string> {
	return (tenant.channelMap as Record<string, string> | null) ?? {};
}

/** Merge entries into the tenant channel map and persist. */
export async function setChannelMapEntries(
	guildId: string,
	entries: Record<string, string>,
): Promise<GuildTenant> {
	const current = await getTenant(guildId);
	const merged = { ...getChannelMap(current), ...entries };
	return updateTenant(guildId, { channelMap: merged });
}

/**
 * Optional per-feature provisioner. Config-backed modules (e.g. automod) register
 * one so that turning the feature on in the setup wizard actually configures and
 * enables the module, and turning it off disables it. Kept in this shared service
 * so `setFeatures` never imports a module's internals.
 */
export type FeatureProvisioner = (guildId: string, enabled: boolean) => Promise<void>;
const provisioners = new Map<string, FeatureProvisioner>();

/** Register a provisioner that runs when a feature flag transitions on or off. */
export function registerFeatureProvisioner(feature: string, fn: FeatureProvisioner): void {
	provisioners.set(feature, fn);
}

/** Merge feature flags into the tenant, persist, and run provisioners for changes. */
export async function setFeatures(
	guildId: string,
	flags: Record<string, boolean>,
): Promise<GuildTenant> {
	const current = await getTenant(guildId);
	const previous = (current.features as Record<string, boolean> | null) ?? {};
	const merged = { ...previous, ...flags };
	const updated = await updateTenant(guildId, { features: merged });
	// Fire provisioners only for flags that actually changed, so a module's config
	// is set up the moment its toggle flips, not just when its own command runs.
	for (const [feature, enabled] of Object.entries(flags)) {
		if (previous[feature] === enabled) continue;
		const provision = provisioners.get(feature);
		if (provision) await provision(guildId, enabled).catch(() => {});
	}
	return updated;
}
