import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuildClient } from "@rostra/web-client";
import { createAuthController, MemorySessionStore } from "./auth.server.ts";
import { createFixtureOAuthAdapter } from "./oauth-adapters.server.ts";
import { createWebRuntime } from "./runtime.server.ts";

function cookiePair(header: string): string {
	return header.split(";", 1)[0] ?? "";
}

async function authenticatedCookie(guildClient: GuildClient) {
	const secret = "test-session-secret-with-enough-entropy";
	const auth = createAuthController({
		adapter: createFixtureOAuthAdapter(),
		redirectUri: "http://localhost:3002/auth/callback",
		secret,
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
	if (!completed.ok) throw new Error("fixture_login_failed");
	const cookie = cookiePair(
		completed.cookies.find((value) => value.startsWith("rostra_session=")) ?? "",
	);
	return { runtime: createWebRuntime({ auth, guildClient, tokenSecret: secret }), cookie };
}

test("guild listing executes the typed client with a different exact-guild principal", async () => {
	const requests: Array<{ guildId: string; token: string }> = [];
	const { runtime, cookie } = await authenticatedCookie({
		async getGuild(guildId, token) {
			requests.push({ guildId, token });
			return { id: guildId, configured: true };
		},
	});
	const response = await runtime.guilds(cookie, 1_200);
	assert.equal(response.status, "ok");
	if (response.status !== "ok") return;
	assert.deepEqual(
		response.guilds.map((guild) => guild.name),
		["Northstar", "Atlas Studio", "Sunday Guild"],
	);
	assert.equal(new Set(requests.map((request) => request.token)).size, 3);
});

test("exact guild reads reject guessed membership before calling the domain client", async () => {
	let calls = 0;
	const { runtime, cookie } = await authenticatedCookie({
		async getGuild(guildId) {
			calls++;
			return { id: guildId, configured: true };
		},
	});
	assert.deepEqual(await runtime.guild(cookie, "guessed-guild", 1_200), { status: "not_found" });
	assert.equal(calls, 0);
	assert.equal((await runtime.guild(cookie, "northstar", 1_200)).status, "ok");
	assert.equal(calls, 1);
});

test("session and domain failures map to unauthorized and degraded states", async () => {
	const { runtime, cookie } = await authenticatedCookie({
		async getGuild() {
			throw new Error("transport detail");
		},
	});
	assert.deepEqual(await runtime.guilds(undefined, 1_200), { status: "unauthorized" });
	assert.deepEqual(await runtime.guilds(cookie, 1_200), { status: "degraded" });
});
