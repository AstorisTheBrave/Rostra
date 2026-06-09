import { ChannelType, type Guild, PermissionFlagsBits } from "discord.js";
import { getLogger } from "@/services/logger.ts";
import { getChannelMap, getTenant, setChannelMapEntries } from "@/services/tenant.ts";
import { CHANNELS, type ChannelSpec, ROLES, type RoleSpec } from "./manifest.ts";

const log = getLogger("provisioning");

export type ItemStatus = "created" | "existed" | "failed";

export interface ProvisionItem {
	key: string;
	name: string;
	kind: "channel" | "role";
	status: ItemStatus;
	id?: string;
	error?: string;
}

export interface ProvisionResult {
	ok: boolean;
	items: ProvisionItem[];
	missingPerms: string[];
}

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Create every channel and role Rostra's systems need, idempotently, and wire each
 * into its owning config. Re-running only creates what is missing and re-points the
 * tenant channelMap, so it doubles as a repair pass. Never throws.
 */
export async function runProvision(guild: Guild): Promise<ProvisionResult> {
	const items: ProvisionItem[] = [];
	const me = guild.members.me;
	const missingPerms: string[] = [];
	if (!me?.permissions.has(PermissionFlagsBits.ManageChannels))
		missingPerms.push("Manage Channels");
	if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) missingPerms.push("Manage Roles");
	if (missingPerms.length) return { ok: false, items, missingPerms };

	const tenant = await getTenant(guild.id);
	const map = getChannelMap(tenant);
	const newEntries: Record<string, string> = {};

	// Roles first: verification wiring depends on the Verified role id.
	for (const spec of ROLES) {
		const res = await ensureRole(guild, spec, map);
		items.push(res);
		if (res.id) newEntries[`role:${spec.key}`] = res.id;
	}
	for (const spec of CHANNELS) {
		const res = await ensureChannel(guild, spec, map);
		items.push(res);
		if (res.id) newEntries[spec.key] = res.id;
	}

	if (Object.keys(newEntries).length > 0) {
		await setChannelMapEntries(guild.id, newEntries).catch((err) =>
			log.error({ err, guild: guild.id }, "channelMap save failed"),
		);
	}
	return { ok: items.every((i) => i.status !== "failed"), items, missingPerms };
}

async function ensureChannel(
	guild: Guild,
	spec: ChannelSpec,
	map: Record<string, string>,
): Promise<ProvisionItem> {
	try {
		const mappedId = map[spec.key];
		const byId = mappedId ? guild.channels.cache.get(mappedId) : undefined;
		const existing =
			byId ?? guild.channels.cache.find((c) => c.name === spec.name && c.isTextBased());
		if (existing?.isTextBased()) {
			await spec.wire?.(guild.id, existing.id);
			return {
				key: spec.key,
				name: spec.name,
				kind: "channel",
				status: "existed",
				id: existing.id,
			};
		}
		const created = await guild.channels.create({
			name: spec.name,
			type: ChannelType.GuildText,
			topic: spec.topic,
			...(spec.staffOnly
				? {
						permissionOverwrites: [
							{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
						],
					}
				: {}),
			reason: "Rostra /setup provision",
		});
		await spec.wire?.(guild.id, created.id);
		return { key: spec.key, name: spec.name, kind: "channel", status: "created", id: created.id };
	} catch (err) {
		log.error({ err, key: spec.key, guild: guild.id }, "provision channel failed");
		return {
			key: spec.key,
			name: spec.name,
			kind: "channel",
			status: "failed",
			error: errMsg(err),
		};
	}
}

async function ensureRole(
	guild: Guild,
	spec: RoleSpec,
	map: Record<string, string>,
): Promise<ProvisionItem> {
	try {
		const mappedId = map[`role:${spec.key}`];
		const existing =
			(mappedId ? guild.roles.cache.get(mappedId) : undefined) ??
			guild.roles.cache.find((r) => r.name === spec.name);
		if (existing) {
			await spec.wire?.(guild.id, existing.id);
			return { key: spec.key, name: spec.name, kind: "role", status: "existed", id: existing.id };
		}
		const created = await guild.roles.create({
			name: spec.name,
			color: spec.color,
			reason: "Rostra /setup provision",
		});
		await spec.wire?.(guild.id, created.id);
		return { key: spec.key, name: spec.name, kind: "role", status: "created", id: created.id };
	} catch (err) {
		log.error({ err, key: spec.key, guild: guild.id }, "provision role failed");
		return { key: spec.key, name: spec.name, kind: "role", status: "failed", error: errMsg(err) };
	}
}
