import assert from "node:assert/strict";
import { test } from "node:test";
import type { Principal } from "@rostra/auth";
import { createRealtimeApp } from "./server.ts";

function authenticate(value: string | undefined): Principal | undefined {
	if (value === "Bearer guild-1")
		return {
			kind: "guild",
			subjectId: "user-1",
			guildId: "guild-1",
			permissions: ["realtime:connect"],
		};
	if (value === "Bearer guild-2")
		return {
			kind: "guild",
			subjectId: "user-1",
			guildId: "guild-2",
			permissions: ["realtime:connect"],
		};
	return undefined;
}

test("realtime health is detail-free and connections are exact-guild scoped", async (t) => {
	const app = createRealtimeApp({ authenticate });
	t.after(() => app.close());
	assert.deepEqual((await app.inject({ method: "GET", url: "/health/live" })).json(), {
		status: "ok",
	});
	assert.equal(
		(await app.inject({ method: "POST", url: "/connections", payload: { guildId: "guild-1" } }))
			.statusCode,
		401,
	);
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/connections",
				headers: { authorization: "Bearer guild-2" },
				payload: { guildId: "guild-1" },
			})
		).statusCode,
		404,
	);
	const allowed = await app.inject({
		method: "POST",
		url: "/connections",
		headers: { authorization: "Bearer guild-1" },
		payload: { guildId: "guild-1" },
	});
	assert.equal(allowed.statusCode, 200);
	assert.deepEqual(allowed.json(), { status: "authorized", guildId: "guild-1" });
});
