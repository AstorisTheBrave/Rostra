import { timingSafeEqual } from "node:crypto";

export type Principal =
	| { kind: "host"; subjectId: string }
	| { kind: "guild"; subjectId: string; guildId: string; permissions: readonly string[] };

export class AuthorizationError extends Error {
	readonly code = "forbidden";
}

export function requireGuildPermission(
	principal: Principal | undefined,
	guildId: string,
	permission: string,
): Extract<Principal, { kind: "guild" }> {
	if (
		principal?.kind !== "guild" ||
		principal.guildId !== guildId ||
		!principal.permissions.includes(permission)
	)
		throw new AuthorizationError("Guild authorization required");
	return principal;
}

export function requireHost(
	principal: Principal | undefined,
): Extract<Principal, { kind: "host" }> {
	if (principal?.kind !== "host") throw new AuthorizationError("Host authorization required");
	return principal;
}

export function requireOperationRead(
	principal: Principal | undefined,
	guildId: string | null,
): Principal {
	return guildId === null
		? requireHost(principal)
		: requireGuildPermission(principal, guildId, "operations:read");
}

export function verifySecret(candidate: string | undefined, expected: string | undefined): boolean {
	if (!candidate || !expected) return false;
	const left = Buffer.from(candidate);
	const right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyBearer(header: string | undefined, expected: string | undefined): boolean {
	if (!header?.startsWith("Bearer ")) return false;
	return verifySecret(header.slice(7), expected);
}
