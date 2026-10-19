import type { PermissionResolvable } from "discord.js";

export function hasModerationPermission(
	permissions: { has(permission: PermissionResolvable): boolean } | null | undefined,
	permission: PermissionResolvable,
): boolean {
	return permissions?.has(permission) ?? false;
}
