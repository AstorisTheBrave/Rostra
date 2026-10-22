import assert from "node:assert/strict";
import { test } from "node:test";
import { createHttpGuildClient, parseGuildSummary } from "./index.ts";

test("guild summaries reject malformed API data", () => {
	assert.equal(parseGuildSummary({ id: "guild-1", configured: true }), true);
	assert.equal(parseGuildSummary({ id: "guild-1", configured: "yes" }), false);
	assert.equal(parseGuildSummary(null), false);
});

test("the HTTP client scopes each read to one guild bearer", async () => {
	let request: { url: string; authorization?: string } | undefined;
	const client = createHttpGuildClient({
		baseUrl: "https://api.example.test/",
		fetch: async (input, init) => {
			request = {
				url: String(input),
				authorization: new Headers(init?.headers).get("authorization") ?? undefined,
			};
			return Response.json({ id: "guild-1", configured: true });
		},
	});
	assert.deepEqual(await client.getGuild("guild-1", "scoped-token"), {
		id: "guild-1",
		configured: true,
	});
	assert.deepEqual(request, {
		url: "https://api.example.test/internal/v1/guilds/guild-1/summary",
		authorization: "Bearer scoped-token",
	});
});

test("the HTTP client distinguishes missing data from a degraded API", async () => {
	const missing = createHttpGuildClient({
		baseUrl: "https://api.example.test",
		fetch: async () => new Response(null, { status: 404 }),
	});
	assert.equal(await missing.getGuild("guild-1", "token"), undefined);
	const degraded = createHttpGuildClient({
		baseUrl: "https://api.example.test",
		fetch: async () => new Response(null, { status: 503 }),
	});
	await assert.rejects(() => degraded.getGuild("guild-1", "token"), /guild_directory_unavailable/);
});
