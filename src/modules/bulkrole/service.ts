import type { Guild } from "discord.js";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("bulkrole");

export type MemberFilter = "humans" | "bots" | "all";
export type RoleAction = "add" | "remove";

/** Whether a member matches the chosen filter. */
export function matchesFilter(isBot: boolean, filter: MemberFilter): boolean {
	if (filter === "humans") return !isBot;
	if (filter === "bots") return isBot;
	return true;
}

export interface BulkResult {
	changed: number;
	skipped: number;
	failed: number;
	total: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Add or remove a role across every member matching the filter. Members are
 * fetched once, then processed with a small delay every few writes to stay well
 * under the role rate limit. Members who already match the desired state are
 * skipped, so re-running is cheap.
 */
export async function applyRoleToAll(
	guild: Guild,
	roleId: string,
	action: RoleAction,
	filter: MemberFilter,
): Promise<BulkResult> {
	const members = await guild.members.fetch();
	const result: BulkResult = { changed: 0, skipped: 0, failed: 0, total: 0 };
	let sincePause = 0;

	for (const member of members.values()) {
		if (!matchesFilter(member.user.bot, filter)) continue;
		result.total++;
		const has = member.roles.cache.has(roleId);
		if ((action === "add" && has) || (action === "remove" && !has)) {
			result.skipped++;
			continue;
		}
		try {
			if (action === "add") await member.roles.add(roleId, "Bulk role add");
			else await member.roles.remove(roleId, "Bulk role remove");
			result.changed++;
		} catch (err) {
			result.failed++;
			log.debug({ err, userId: member.id }, "bulk role write failed");
		}
		if (++sincePause >= 5) {
			sincePause = 0;
			await sleep(750);
		}
	}
	return result;
}
