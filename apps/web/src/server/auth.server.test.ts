import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthController, MemorySessionStore, type OAuthAdapter } from "./auth.server.ts";

const identity = {
	profile: { id: "user-1", name: "Jamie" },
	guilds: [
		{ id: "northstar", name: "Northstar", access: "administrator" as const },
		{ id: "atlas", name: "Atlas Studio", access: "manager" as const },
		{ id: "sunday", name: "Sunday Guild", access: "member" as const },
	],
};

function adapter(onExchange?: (verifier: string) => void): OAuthAdapter {
	return {
		authorizationUrl({ state, challenge, redirectUri }) {
			assert.ok(state.length >= 32);
			assert.ok(challenge.length >= 32);
			const url = new URL(redirectUri);
			url.searchParams.set("code", "fixture-code");
			url.searchParams.set("state", state);
			url.searchParams.set("code_challenge", challenge);
			return url.toString();
		},
		async exchange(code, verifier) {
			assert.equal(code, "fixture-code");
			onExchange?.(verifier);
			return identity;
		},
	};
}

function cookiePair(header: string): string {
	return header.split(";", 1)[0] ?? "";
}

test("authorization creates a signed state and PKCE attempt cookie", () => {
	const auth = createAuthController({
		adapter: adapter(),
		redirectUri: "http://localhost:3002/auth/callback",
		secret: "test-session-secret-with-enough-entropy",
		store: new MemorySessionStore(),
		secure: false,
	});
	const started = auth.start(1_000);
	assert.match(started.location, /code_challenge/);
	assert.match(started.location, /state=/);
	assert.match(started.cookies[0] ?? "", /HttpOnly/);
	assert.match(started.cookies[0] ?? "", /SameSite=Lax/);
});

test("callback checks state, exchanges with the original verifier and issues an opaque session", async () => {
	let exchangedVerifier = "";
	const store = new MemorySessionStore();
	const auth = createAuthController({
		adapter: adapter((verifier) => {
			exchangedVerifier = verifier;
		}),
		redirectUri: "http://localhost:3002/auth/callback",
		secret: "test-session-secret-with-enough-entropy",
		store,
		secure: false,
	});
	const started = auth.start(1_000);
	const state = new URL(started.location).searchParams.get("state");
	assert.ok(state);
	const completed = await auth.callback(
		new URLSearchParams({ code: "fixture-code", state }),
		cookiePair(started.cookies[0] ?? ""),
		1_100,
	);
	assert.equal(completed.ok, true);
	assert.ok(exchangedVerifier.length >= 32);
	if (!completed.ok) return;
	const sessionCookie = completed.cookies.find((cookie) => cookie.startsWith("rostra_session="));
	assert.ok(sessionCookie);
	assert.deepEqual(auth.session(cookiePair(sessionCookie), 1_101), completed.session);
	assert.doesNotMatch(sessionCookie, /Jamie|Northstar|user-1/);
});

test("callback failures are explicit and never create a session", async () => {
	const auth = createAuthController({
		adapter: adapter(),
		redirectUri: "http://localhost:3002/auth/callback",
		secret: "test-session-secret-with-enough-entropy",
		store: new MemorySessionStore(),
		secure: false,
	});
	const started = auth.start(1_000);
	assert.deepEqual(
		await auth.callback(
			new URLSearchParams({ code: "fixture-code", state: "swapped" }),
			cookiePair(started.cookies[0] ?? ""),
			1_100,
		),
		{ ok: false, error: "invalid_state", cookies: [auth.clearAttemptCookie()] },
	);
	const denied = await auth.callback(
		new URLSearchParams({ error: "access_denied" }),
		undefined,
		1_100,
	);
	assert.equal(denied.ok, false);
	if (!denied.ok) assert.equal(denied.error, "access_denied");
});

test("logout revokes the opaque server session", async () => {
	const auth = createAuthController({
		adapter: adapter(),
		redirectUri: "http://localhost:3002/auth/callback",
		secret: "test-session-secret-with-enough-entropy",
		store: new MemorySessionStore(),
		secure: false,
	});
	const started = auth.start(1_000);
	const state = new URL(started.location).searchParams.get("state") ?? "";
	const completed = await auth.callback(
		new URLSearchParams({ code: "fixture-code", state }),
		cookiePair(started.cookies[0] ?? ""),
		1_100,
	);
	assert.equal(completed.ok, true);
	if (!completed.ok) return;
	const sessionCookie = completed.cookies.find((cookie) => cookie.startsWith("rostra_session="));
	assert.ok(sessionCookie);
	auth.logout(cookiePair(sessionCookie));
	assert.equal(auth.session(cookiePair(sessionCookie), 1_101), undefined);
});
