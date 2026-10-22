import type { GuildMember, PermissionResolvable } from "discord.js";

// Shared permission gate for Discord-native guild permissions.

/**
 * A member must hold the native Discord permission.
 */
export function memberCan(member: GuildMember, perm: PermissionResolvable): boolean {
	return member.permissions.has(perm);
}
