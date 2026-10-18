import { createHmac, timingSafeEqual } from "node:crypto";

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

interface PrincipalToken {
	principal: Principal;
	expiresAt: number;
}

function signature(value: string, secret: string): string {
	return createHmac("sha256", secret).update(value).digest("base64url");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function principalFrom(value: unknown): Principal | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.kind === "host" && typeof candidate.subjectId === "string")
		return { kind: "host", subjectId: candidate.subjectId };
	if (
		candidate.kind === "guild" &&
		typeof candidate.subjectId === "string" &&
		typeof candidate.guildId === "string" &&
		isStringArray(candidate.permissions)
	)
		return {
			kind: "guild",
			subjectId: candidate.subjectId,
			guildId: candidate.guildId,
			permissions: candidate.permissions,
		};
	return undefined;
}

/** Issue a short-lived bearer for one already-authorized principal. */
export function issuePrincipalToken(
	principal: Principal,
	secret: string,
	expiresAt = Date.now() + 60_000,
): string {
	const payload = Buffer.from(
		JSON.stringify({ principal, expiresAt } satisfies PrincipalToken),
	).toString("base64url");
	return `${payload}.${signature(payload, secret)}`;
}

/** Verify the bearer signature, expiry and complete principal shape. */
export function verifyPrincipalToken(
	token: string | undefined,
	secret: string | undefined,
	now = Date.now(),
): Principal | undefined {
	if (!token || !secret) return undefined;
	const [payload, supplied, extra] = token.split(".");
	if (!payload || !supplied || extra) return undefined;
	if (!verifySecret(supplied, signature(payload, secret))) return undefined;
	try {
		const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
		if (!decoded || typeof decoded !== "object") return undefined;
		const record = decoded as Record<string, unknown>;
		if (typeof record.expiresAt !== "number" || record.expiresAt < now) return undefined;
		return principalFrom(record.principal);
	} catch {
		return undefined;
	}
}
