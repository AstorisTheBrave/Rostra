import assert from "node:assert/strict";
import { test } from "node:test";
import { issuePrincipalToken, verifyPrincipalToken } from "./index.ts";

const principal = {
	kind: "guild" as const,
	subjectId: "user-1",
	guildId: "guild-1",
	permissions: ["guilds:read"],
};

test("principal tokens preserve an exact tenant scope until expiry", () => {
	const token = issuePrincipalToken(principal, "a-secret-with-enough-entropy", 2_000);
	assert.deepEqual(verifyPrincipalToken(token, "a-secret-with-enough-entropy", 1_999), principal);
	assert.equal(verifyPrincipalToken(token, "a-secret-with-enough-entropy", 2_001), undefined);
});

test("principal tokens reject tampering, another secret and malformed payloads", () => {
	const token = issuePrincipalToken(principal, "a-secret-with-enough-entropy", 2_000);
	assert.equal(verifyPrincipalToken(`${token}x`, "a-secret-with-enough-entropy", 1_000), undefined);
	assert.equal(verifyPrincipalToken(token, "another-secret-with-entropy", 1_000), undefined);
	assert.equal(
		verifyPrincipalToken("not-a-token", "a-secret-with-enough-entropy", 1_000),
		undefined,
	);
});
