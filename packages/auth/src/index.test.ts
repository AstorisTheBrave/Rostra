import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AuthorizationError,
	requireGuildPermission,
	requireHost,
	verifyBearer,
	verifySecret,
} from "./index.ts";

const guild = {
	kind: "guild" as const,
	subjectId: "user-1",
	guildId: "guild-1",
	permissions: ["operations:write"],
};

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

test("secret checks reject missing, malformed and unequal values", () => {
	assert.equal(verifySecret("secret", "secret"), true);
	assert.equal(verifySecret("wrong", "secret"), false);
	assert.equal(verifyBearer("Bearer secret", "secret"), true);
	assert.equal(verifyBearer("secret", "secret"), false);
});
