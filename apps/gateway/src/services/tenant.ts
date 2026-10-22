import { createCoherentCache } from "@rostra/cache";
import type { PublicationOutcome } from "@rostra/cache/bus";
import type { GuildTenant, Prisma } from "@rostra/database";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

/**
 * Centralized per-guild config ("tenant"). A bounded per-process cache loads
 * misses from Postgres. Writes through `updateTenant` notify other processes;
 * missed invalidations expire within five minutes.
 */
const cache = createCoherentCache<GuildTenant>("tenant", "guild", {
	maxEntries: 1_000,
});
const log = getLogger("tenant");
type TenantWriteOutcome = { value: GuildTenant; coherence: PublicationOutcome };

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
	return (await updateTenantWithOutcome(guildId, patch)).value;
}

export async function updateTenantWithOutcome(
	guildId: string,
	patch: TenantPatch,
): Promise<TenantWriteOutcome> {
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
	return cache.write(guildId, (tx) =>
		tx.guildTenant.upsert({
			where: { guildId },
			create: { guildId, ...data },
			update: data,
		}),
	);
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
export async function isFeatureBlocked(
	guildId: string,
	feature: string,
	read: (guildId: string) => Promise<GuildTenant> = getTenant,
): Promise<boolean> {
	try {
		return tenantFeature(await read(guildId), feature) === false;
	} catch (err) {
		log.error({ err, guildId, feature }, "feature state unavailable; blocking feature");
		return true;
	}
}

/** Read a free-form setting from the tenant. */
export function getSetting<T = unknown>(tenant: GuildTenant, key: string): T | undefined {
	const map = tenant.settings as Record<string, unknown> | null;
	return map?.[key] as T | undefined;
}

/** The tenant's logical-key -> channel/role id registry (written by /setup provision). */
export function getChannelMap(tenant: Pick<GuildTenant, "channelMap">): Record<string, string> {
	return (tenant.channelMap as Record<string, string> | null) ?? {};
}

/** Merge entries into the tenant channel map and persist. */
export async function setChannelMapEntries(
	guildId: string,
	entries: Record<string, string>,
): Promise<TenantWriteOutcome> {
	const current = await getTenant(guildId);
	const merged = { ...getChannelMap(current), ...entries };
	return updateTenantWithOutcome(guildId, { channelMap: merged });
}

/**
 * Optional per-feature provisioner. Config-backed modules (e.g. automod) register
 * one so that turning the feature on in the setup wizard actually configures and
 * enables the module, and turning it off disables it. Kept in this shared service
 * so `setFeatures` never imports a module's internals.
 */
export type FeatureProvisioner = (
	guildId: string,
	enabled: boolean,
) => Promise<{ coherence: PublicationOutcome } | undefined>;
const provisioners = new Map<string, FeatureProvisioner>();

/** Register a provisioner that runs when a feature flag transitions on or off. */
export function registerFeatureProvisioner(feature: string, fn: FeatureProvisioner): void {
	provisioners.set(feature, fn);
}

/** Merge feature flags into the tenant, persist, and run provisioners for changes. */
export async function setFeatures(
	guildId: string,
	flags: Record<string, boolean>,
	deps: {
		read: (guildId: string) => Promise<GuildTenant>;
		write: (guildId: string, patch: TenantPatch) => Promise<TenantWriteOutcome>;
		provision: (
			feature: string,
			guildId: string,
			enabled: boolean,
		) => ReturnType<FeatureProvisioner>;
	} = {
		read: getTenant,
		write: updateTenantWithOutcome,
		provision: async (feature, guildId, enabled) => {
			return provisioners.get(feature)?.(guildId, enabled);
		},
	},
): Promise<TenantWriteOutcome & { failedProvisioners: string[] }> {
	const current = await deps.read(guildId);
	const previous = (current.features as Record<string, boolean> | null) ?? {};
	const merged = { ...previous, ...flags };
	const updated = await deps.write(guildId, { features: merged });
	let coherence = updated.coherence;
	const failedProvisioners: string[] = [];
	// Fire provisioners only for flags that actually changed, so a module's config
	// is set up the moment its toggle flips, not just when its own command runs.
	for (const [feature, enabled] of Object.entries(flags)) {
		if (previous[feature] === enabled) continue;
		try {
			const provisioned = await deps.provision(feature, guildId, enabled);
			if (provisioned?.coherence.status === "ttl-fallback") coherence = provisioned.coherence;
		} catch (err) {
			failedProvisioners.push(feature);
			log.error({ err, guildId, feature }, "feature provisioner failed after tenant commit");
		}
	}
	return { ...updated, coherence, failedProvisioners };
}
