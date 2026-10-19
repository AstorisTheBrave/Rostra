import assert from "node:assert/strict";
import { test } from "node:test";
import type { Principal } from "@rostra/auth";
import { createActivityApp } from "./server.ts";

function authenticate(value: string | undefined): Principal | undefined {
	if (value !== "Bearer activity") return undefined;
	return {
		kind: "guild",
		subjectId: "user-1",
		guildId: "guild-1",
		permissions: ["activity:launch"],
	};
}

test("Activity health is detail-free and launch authorization is tenant scoped", async (t) => {
	const app = await createActivityApp({ authenticate });
	t.after(() => app.close());
	assert.deepEqual((await app.inject({ method: "GET", url: "/health/live" })).json(), {
		status: "ok",
	});
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/sessions",
				headers: { authorization: "Bearer activity" },
				payload: { guildId: "guild-2" },
			})
		).statusCode,
		404,
	);
	const allowed = await app.inject({
		method: "POST",
		url: "/sessions",
		headers: { authorization: "Bearer activity" },
		payload: { guildId: "guild-1" },
	});
	assert.deepEqual(allowed.json(), { status: "authorized", guildId: "guild-1" });
});

test("Activity session creation is rate limited without throttling health", async (t) => {
	const app = await createActivityApp({ authenticate });
	t.after(() => app.close());
	let statusCode = 0;
	for (let attempt = 0; attempt < 61; attempt += 1) {
		const response = await app.inject({
			method: "POST",
			url: "/sessions",
			headers: { authorization: "Bearer activity" },
			payload: { guildId: "guild-1" },
		});
		statusCode = response.statusCode;
	}
	assert.equal(statusCode, 429);
	assert.equal((await app.inject({ method: "GET", url: "/health/live" })).statusCode, 200);
});
