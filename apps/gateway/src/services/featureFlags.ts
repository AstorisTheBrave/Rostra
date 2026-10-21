import { type PublicationOutcome, publish, type Subscription, subscribe } from "@rostra/cache/bus";
import { getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";

/**
 * Fleet-wide feature flags - the "ship dormant, activate live" + instant
 * kill-switch layer. A feature's code registers a flag with a default (dormant =
 * off); a `FeatureFlag` DB row overrides it. Flipping a flag writes the row and
 * publishes on the control bus for shard delivery. This is global (whole bot); per-guild
 * toggles stay in the tenant config.
 */

const log = getLogger("flags");
const CHANNEL = "rostra:flags";

const declared = new Map<string, boolean>(); // name -> registered default
const overrides = new Map<string, boolean>(); // name -> live DB override
const pendingUpdates = new Map<string, boolean>(); // messages received before a read settles
let loaded = false;
let loading = false;
let inFlightLoad: Promise<number> | undefined;

/** Declare a feature and its default state. Call at module import (dormant = false). */
export function registerFeature(name: string, defaultEnabled = false): void {
	if (!declared.has(name)) declared.set(name, defaultEnabled);
}

/** Resolve a flag: live override if set, else the registered default, else false. */
export function isFeatureLive(name: string): boolean {
	return loaded ? (overrides.get(name) ?? declared.get(name) ?? false) : false;
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

/** Load persisted overrides, replaying bus updates received during the read. Concurrent calls share one read. */
export function loadFeatureFlags(
	read: () => Promise<{ name: string; enabled: boolean }[]> = () =>
		getPrisma().featureFlag.findMany(),
): Promise<number> {
	if (inFlightLoad) return inFlightLoad;
	loading = true;
	const task = (async () => {
		let rows: { name: string; enabled: boolean }[];
		try {
			rows = await read();
		} catch (err) {
			log.error({ err }, "failed to load feature flags");
			throw err;
		}
		overrides.clear();
		for (const row of rows) overrides.set(row.name, row.enabled);
		for (const [name, enabled] of pendingUpdates) overrides.set(name, enabled);
		pendingUpdates.clear();
		loaded = true;
		return rows.length;
	})();
	inFlightLoad = task;
	const finish = () => {
		loading = false;
		inFlightLoad = undefined;
		// Reload failures keep the live override, while initial failures retain
		// messages until the first successful persisted-state read.
		if (loaded) pendingUpdates.clear();
	};
	void task.then(finish, finish);
	return task;
}

/** Apply a validated bus change immediately when live and buffer it during a read. */
export function applyFlagMessage(payload: unknown): void {
	const msg = (payload ?? {}) as { name?: string; enabled?: boolean };
	if (typeof msg.name !== "string" || !declared.has(msg.name) || typeof msg.enabled !== "boolean")
		return;
	// A message before the read starts is already reflected by a later primary DB read.
	if (loading) pendingUpdates.set(msg.name, msg.enabled);
	if (loaded) overrides.set(msg.name, msg.enabled);
}

/** Subscribe this shard to live flag flips. Call at boot. */
export function subscribeFeatureFlags(): Subscription {
	const subscription = subscribe(CHANNEL, applyFlagMessage);
	void subscription.ready.then((outcome) => {
		if (outcome.status === "ttl-fallback")
			log.error(
				{ reason: outcome.reason },
				"feature flag subscription unavailable; updates require restart or manual reload",
			);
	});
	return subscription;
}

/** Save a global flag, apply locally, then request delivery to other shards. */
export async function setFeatureLive(
	name: string,
	enabled: boolean,
	deps: {
		write: (name: string, enabled: boolean) => Promise<unknown>;
		publish: (channel: string, value: unknown) => Promise<PublicationOutcome>;
	} = {
		write: (name, enabled) =>
			getPrisma().featureFlag.upsert({
				where: { name },
				create: { name, enabled },
				update: { enabled },
			}),
		publish,
	},
): Promise<PublicationOutcome> {
	await deps.write(name, enabled);
	overrides.set(name, enabled);
	if (loading) pendingUpdates.set(name, enabled);
	let outcome: PublicationOutcome;
	try {
		outcome = await deps.publish(CHANNEL, { name, enabled });
	} catch (err) {
		log.error({ err, name }, "feature flag publication failed after commit");
		outcome = { status: "ttl-fallback", reason: "publish-failed" };
	}
	if (outcome.status === "ttl-fallback")
		log.warn({ name, reason: outcome.reason }, "feature flag update did not reach the fleet");
	return outcome;
}
