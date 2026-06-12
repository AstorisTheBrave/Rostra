import type { GuildMember, PermissionResolvable } from "discord.js";
import { config } from "@/config.ts";

// Shared permission gate. Rostra leans on Discord-native `default_member_permissions`
// per command; this layer adds the one cross-cutting rule worth centralising: a
// configured bot owner (OWNER_IDS) always passes, so the operator can support and
// recover servers without being granted roles. Fail-closed by default - callers
// deny when these return false.

/** Whether a user is a configured bot owner. */
export function isBotOwner(userId: string): boolean {
	return config.discord.ownerIds.includes(userId);
}

/**
 * Permission check with owner bypass: a bot owner always passes; otherwise the
 * member must hold the native Discord permission.
 */
export function memberCan(member: GuildMember, perm: PermissionResolvable): boolean {
	if (isBotOwner(member.id)) return true;
	return member.permissions.has(perm);
}
