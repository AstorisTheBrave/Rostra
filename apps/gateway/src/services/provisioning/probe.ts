import type { Guild } from "discord.js";
import { getChannelMap, getTenant } from "@/services/tenant.ts";
import { CHANNELS, ROLES } from "./manifest.ts";

export type ProbeStatus = "ok" | "missing" | "unmapped";

export interface ProbeItem {
	key: string;
	name: string;
	kind: "channel" | "role";
	/** ok = resolved; missing = mapped id is gone (drift, repair needed); unmapped = never provisioned. */
	status: ProbeStatus;
	id?: string;
}

/**
 * Read-only health probe of the provisioned channels and roles. Never writes or
 * creates anything - it reports what `/setup provision` would fix. Resolves each
 * spec from the tenant channelMap, falling back to a by-name match.
 */
export async function probeProvision(guild: Guild): Promise<ProbeItem[]> {
	const tenant = await getTenant(guild.id);
	const map = getChannelMap(tenant);
	const items: ProbeItem[] = [];

	for (const spec of ROLES) {
		const mappedId = map[`role:${spec.key}`];
		const role =
			(mappedId ? guild.roles.cache.get(mappedId) : undefined) ??
			guild.roles.cache.find((r) => r.name === spec.name);
		items.push({
			key: spec.key,
			name: spec.name,
			kind: "role",
			status: role ? "ok" : mappedId ? "missing" : "unmapped",
			id: role?.id,
		});
	}
	for (const spec of CHANNELS) {
		const mappedId = map[spec.key];
		const channel =
			(mappedId ? guild.channels.cache.get(mappedId) : undefined) ??
			guild.channels.cache.find((c) => c.name === spec.name && c.isTextBased());
		items.push({
			key: spec.key,
			name: spec.name,
			kind: "channel",
			status: channel ? "ok" : mappedId ? "missing" : "unmapped",
			id: channel?.id,
		});
	}
	return items;
}
