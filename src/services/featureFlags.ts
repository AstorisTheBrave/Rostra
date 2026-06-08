import { publish, subscribe } from "@/services/bus.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Fleet-wide feature flags - the "ship dormant, activate live" + instant
 * kill-switch layer. A feature's code registers a flag with a default (dormant =
 * off); a `FeatureFlag` DB row overrides it. Flipping a flag writes the row and
 * publishes on the control bus, so every shard activates or kills the feature in
 * memory immediately, with no restart. This is global (whole bot); per-guild
 * toggles stay in the tenant config.
 */

const log = getLogger("flags");
const CHANNEL = "rostra:flags";

const declared = new Map<string, boolean>(); // name -> registered default
const overrides = new Map<string, boolean>(); // name -> live DB override

/** Declare a feature and its default state. Call at module import (dormant = false). */
export function registerFeature(name: string, defaultEnabled = false): void {
	if (!declared.has(name)) declared.set(name, defaultEnabled);
}

/** Resolve a flag: live override if set, else the registered default, else false. */
export function isFeatureLive(name: string): boolean {
	return overrides.get(name) ?? declared.get(name) ?? false;
}

/** Every declared feature with its default and current live state. */
export function listFeatures(): { name: string; default: boolean; live: boolean }[] {
	return [...declared.keys()].sort().map((name) => ({
		name,
		default: declared.get(name) ?? false,
		live: isFeatureLive(name),
	}));
}

/** Whether a flag name has been declared by some module. */
export function isDeclared(name: string): boolean {
	return declared.has(name);
}

/** Load all flag overrides from the DB into memory. Call at boot. */
export async function loadFeatureFlags(): Promise<number> {
	const rows = await getPrisma()
		.featureFlag.findMany()
		.catch((err) => {
			log.error({ err }, "failed to load feature flags");
			return [] as { name: string; enabled: boolean }[];
		});
	overrides.clear();
	for (const row of rows) overrides.set(row.name, row.enabled);
	return rows.length;
}

/** Apply a flag-change message to the in-memory override map (bus handler). */
export function applyFlagMessage(payload: unknown): void {
	const msg = (payload ?? {}) as { name?: string; enabled?: boolean };
	if (msg.name && typeof msg.enabled === "boolean") overrides.set(msg.name, msg.enabled);
}

/** Subscribe this shard to live flag flips. Call at boot. */
export function subscribeFeatureFlags(): void {
	subscribe(CHANNEL, applyFlagMessage);
}

/** Flip a flag fleet-wide: persist, apply locally, and fan out to every shard. */
export async function setFeatureLive(name: string, enabled: boolean): Promise<void> {
	await getPrisma().featureFlag.upsert({
		where: { name },
		create: { name, enabled },
		update: { enabled },
	});
	overrides.set(name, enabled);
	await publish(CHANNEL, { name, enabled });
}
