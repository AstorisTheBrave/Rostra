import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GuildMembership, WebProfile } from "@rostra/web-client";

export interface WebSession {
	id: string;
	profile: WebProfile;
	guilds: readonly GuildMembership[];
	expiresAt: number;
}

export interface OAuthIdentity {
	profile: WebProfile;
	guilds: readonly GuildMembership[];
}

export interface OAuthAdapter {
	authorizationUrl(input: { state: string; challenge: string; redirectUri: string }): string;
	exchange(code: string, verifier: string): Promise<OAuthIdentity>;
}

export interface SessionStore {
	put(session: WebSession, now: number): void;
	get(id: string, now: number): WebSession | undefined;
	delete(id: string): void;
}

export class MemorySessionStore implements SessionStore {
	readonly #sessions = new Map<string, WebSession>();

	put(session: WebSession, now: number): void {
		for (const [id, current] of this.#sessions) {
			if (current.expiresAt < now) this.#sessions.delete(id);
		}
		this.#sessions.set(session.id, session);
	}

	get(id: string, now: number): WebSession | undefined {
		const session = this.#sessions.get(id);
		if (!session || session.expiresAt < now) {
			this.#sessions.delete(id);
			return undefined;
		}
		return session;
	}

	delete(id: string): void {
		this.#sessions.delete(id);
	}
}

export type OAuthErrorCode =
	| "access_denied"
	| "invalid_state"
	| "invalid_callback"
	| "exchange_failed";

interface OAuthAttempt {
	state: string;
	verifier: string;
	expiresAt: number;
}

const OAUTH_SECONDS = 10 * 60;
const SESSION_SECONDS = 8 * 60 * 60;

function sign(value: string, secret: string): string {
	return createHmac("sha256", secret).update(value).digest("base64url");
}

function encode(value: unknown, secret: string): string {
	const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${payload}.${sign(payload, secret)}`;
}

function decode(value: string | undefined, secret: string): unknown {
	if (!value) return undefined;
	const [payload, supplied, extra] = value.split(".");
	if (!payload || !supplied || extra) return undefined;
	const expected = Buffer.from(sign(payload, secret));
	const actual = Buffer.from(supplied);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return undefined;
	}
}

function cookieValue(cookie: string | undefined, name: string): string | undefined {
	for (const part of cookie?.split(";") ?? []) {
		const [key, ...value] = part.trim().split("=");
		if (key === name) return value.join("=");
	}
	return undefined;
}

function serializeCookie(
	name: string,
	value: string,
	options: { maxAge: number; secure: boolean },
): string {
	return [
		`${name}=${value}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${options.maxAge}`,
		options.secure ? "Secure" : undefined,
	]
		.filter(Boolean)
		.join("; ");
}

function isAttempt(value: unknown): value is OAuthAttempt {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.state === "string" &&
		typeof candidate.verifier === "string" &&
		typeof candidate.expiresAt === "number"
	);
}

export function createAuthController(options: {
	adapter: OAuthAdapter;
	redirectUri: string;
	secret: string;
	store: SessionStore;
	secure: boolean;
}) {
	const prefix = options.secure ? "__Host-" : "";
	const oauthCookie = `${prefix}rostra_oauth`;
	const sessionCookie = `${prefix}rostra_session`;
	const clear = (name: string) => serializeCookie(name, "", { maxAge: 0, secure: options.secure });

	function sessionId(cookie: string | undefined): string | undefined {
		const value = decode(cookieValue(cookie, sessionCookie), options.secret);
		return typeof value === "string" ? value : undefined;
	}

	return {
		clearAttemptCookie: () => clear(oauthCookie),
		start(now = Date.now()) {
			const state = randomBytes(32).toString("base64url");
			const verifier = randomBytes(32).toString("base64url");
			const challenge = createHash("sha256").update(verifier).digest("base64url");
			const attempt: OAuthAttempt = { state, verifier, expiresAt: now + OAUTH_SECONDS * 1_000 };
			return {
				location: options.adapter.authorizationUrl({
					state,
					challenge,
					redirectUri: options.redirectUri,
				}),
				cookies: [
					serializeCookie(oauthCookie, encode(attempt, options.secret), {
						maxAge: OAUTH_SECONDS,
						secure: options.secure,
					}),
				],
			};
		},
		async callback(
			query: URLSearchParams,
			cookie: string | undefined,
			now = Date.now(),
		): Promise<
			| { ok: true; session: WebSession; cookies: string[] }
			| { ok: false; error: OAuthErrorCode; cookies: string[] }
		> {
			if (query.get("error"))
				return { ok: false, error: "access_denied", cookies: [clear(oauthCookie)] };
			const code = query.get("code");
			const state = query.get("state");
			if (!code || !state)
				return { ok: false, error: "invalid_callback", cookies: [clear(oauthCookie)] };
			const attempt = decode(cookieValue(cookie, oauthCookie), options.secret);
			if (!isAttempt(attempt) || attempt.expiresAt < now || attempt.state !== state)
				return { ok: false, error: "invalid_state", cookies: [clear(oauthCookie)] };
			try {
				const identity = await options.adapter.exchange(code, attempt.verifier);
				const session: WebSession = {
					id: randomBytes(32).toString("base64url"),
					profile: identity.profile,
					guilds: identity.guilds,
					expiresAt: now + SESSION_SECONDS * 1_000,
				};
				options.store.put(session, now);
				return {
					ok: true,
					session,
					cookies: [
						clear(oauthCookie),
						serializeCookie(sessionCookie, encode(session.id, options.secret), {
							maxAge: SESSION_SECONDS,
							secure: options.secure,
						}),
					],
				};
			} catch {
				return { ok: false, error: "exchange_failed", cookies: [clear(oauthCookie)] };
			}
		},
		session(cookie: string | undefined, now = Date.now()): WebSession | undefined {
			const id = sessionId(cookie);
			return id ? options.store.get(id, now) : undefined;
		},
		logout(cookie: string | undefined): string[] {
			const id = sessionId(cookie);
			if (id) options.store.delete(id);
			return [clear(sessionCookie)];
		},
	};
}
