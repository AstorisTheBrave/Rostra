import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiscordOAuthAdapter, createFixtureOAuthAdapter } from "./oauth-adapters.server.ts";

test("fixture OAuth preserves state and PKCE in its disposable round trip", async () => {
	const adapter = createFixtureOAuthAdapter();
	const url = new URL(
		adapter.authorizationUrl({
			state: "state-value",
			challenge: "challenge-value",
			redirectUri: "http://localhost:3002/auth/callback",
		}),
	);
	assert.equal(url.searchParams.get("state"), "state-value");
	assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
	assert.deepEqual((await adapter.exchange("fixture-code", "verifier")).profile, {
		id: "user-1",
		name: "Jamie",
	});
});

test("Discord OAuth sends the verifier and maps guild permissions without retaining the token", async () => {
	const calls: Array<{ url: string; authorization?: string; body?: string }> = [];
	const adapter = createDiscordOAuthAdapter({
		clientId: "client-1",
		clientSecret: "secret-1",
		redirectUri: "https://rostra.example/auth/callback",
		fetch: async (input, init) => {
			calls.push({
				url: String(input),
				authorization: new Headers(init?.headers).get("authorization") ?? undefined,
				body: typeof init?.body === "string" ? init.body : init?.body?.toString(),
			});
			if (String(input).endsWith("/oauth2/token"))
				return Response.json({ access_token: "temporary-token", token_type: "Bearer" });
			if (String(input).endsWith("/users/@me"))
				return Response.json({ id: "user-1", global_name: "Jamie", username: "jamie" });
			return Response.json([
				{ id: "guild-1", name: "Northstar", permissions: "8" },
				{ id: "guild-2", name: "Atlas Studio", permissions: "32" },
				{ id: "guild-3", name: "Sunday Guild", permissions: "0" },
			]);
		},
	});
	const identity = await adapter.exchange("code-1", "verifier-1");
	assert.match(calls[0]?.body ?? "", /code_verifier=verifier-1/);
	assert.equal(calls[1]?.authorization, "Bearer temporary-token");
	assert.deepEqual(
		identity.guilds.map((guild) => guild.access),
		["administrator", "manager", "member"],
	);
	assert.doesNotMatch(JSON.stringify(identity), /temporary-token/);
});
