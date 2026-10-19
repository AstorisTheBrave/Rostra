import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AuthorizationError,
	type Principal,
	requireGuildPermission,
	requireHost,
	requireOperationRead,
	resolveGuildCapabilities,
	verifyBearer,
	verifySecret,
} from "./index.ts";

const guild = {
	kind: "guild" as const,
	subjectId: "user-1",
	guildId: "guild-1",
	permissions: ["operations:write"],
} satisfies Principal;

test("guild authorization rejects host access and swapped tenant ids", () => {
	assert.throws(
		() =>
			requireGuildPermission(
				{ kind: "host", subjectId: "operator" },
				"guild-1",
				"operations:write",
			),
		AuthorizationError,
	);
	assert.throws(
		() => requireGuildPermission(guild, "guild-2", "operations:write"),
		AuthorizationError,
	);
	assert.equal(requireGuildPermission(guild, "guild-1", "operations:write"), guild);
});

test("host authorization never accepts a guild principal", () => {
	assert.throws(() => requireHost(guild), AuthorizationError);
	assert.equal(requireHost({ kind: "host", subjectId: "operator" }).subjectId, "operator");
});

test("operation reads keep host and guild scopes separate", () => {
	const reader = { ...guild, permissions: ["operations:read"] as const };
	assert.equal(requireOperationRead(reader, "guild-1"), reader);
	assert.throws(() => requireOperationRead(reader, "guild-2"), AuthorizationError);
	assert.throws(
		() => requireOperationRead({ kind: "host", subjectId: "operator" }, "guild-1"),
		AuthorizationError,
	);
	assert.equal(requireOperationRead({ kind: "host", subjectId: "operator" }, null).kind, "host");
});

test("secret checks reject missing, malformed and unequal values", () => {
	assert.equal(verifySecret("secret", "secret"), true);
	assert.equal(verifySecret("wrong", "secret"), false);
	assert.equal(verifyBearer("Bearer secret", "secret"), true);
	assert.equal(verifyBearer("secret", "secret"), false);
});

test("current membership and grants decide private and admin capabilities", async () => {
	let grants: readonly string[] | undefined = ["operations:read", "guilds:admin"];
	const store = {
		async memberCapabilities(subjectId: string, guildId: string) {
			assert.equal(subjectId, "user-1");
			assert.equal(guildId, "guild-1");
			return grants;
		},
	};
	assert.deepEqual(await resolveGuildCapabilities(store, "user-1", "guild-1"), [
		"guilds:read",
		"operations:read",
		"guilds:admin",
	]);
	grants = [];
	assert.deepEqual(await resolveGuildCapabilities(store, "user-1", "guild-1"), ["guilds:read"]);
	grants = undefined;
	assert.deepEqual(await resolveGuildCapabilities(store, "user-1", "guild-1"), []);
});

test("unknown stored grants do not become capabilities", async () => {
	const store = {
		async memberCapabilities() {
			return ["unknown:grant", "guilds:admin"];
		},
	};
	assert.deepEqual(await resolveGuildCapabilities(store, "user-1", "guild-1"), [
		"guilds:read",
		"guilds:admin",
	]);
});
