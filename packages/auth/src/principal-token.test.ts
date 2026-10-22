import assert from "node:assert/strict";
import { test } from "node:test";
import { issuePrincipalToken, type Principal, verifyPrincipalToken } from "./index.ts";

const principal = {
	kind: "guild" as const,
	subjectId: "user-1",
	guildId: "guild-1",
	permissions: ["guilds:read"],
} satisfies Principal;

test("principal tokens preserve an exact tenant scope until expiry", () => {
	const token = issuePrincipalToken(principal, "api", "a-secret-with-enough-entropy", 2_000);
	assert.deepEqual(
		verifyPrincipalToken(token, "a-secret-with-enough-entropy", "api", 1_999),
		principal,
	);
	assert.equal(
		verifyPrincipalToken(token, "a-secret-with-enough-entropy", "api", 2_001),
		undefined,
	);
});

test("principal tokens reject tampering, another secret and malformed payloads", () => {
	const token = issuePrincipalToken(principal, "api", "a-secret-with-enough-entropy", 2_000);
	assert.equal(
		verifyPrincipalToken(`${token}x`, "a-secret-with-enough-entropy", "api", 1_000),
		undefined,
	);
	assert.equal(verifyPrincipalToken(token, "another-secret-with-entropy", "api", 1_000), undefined);
	assert.equal(
		verifyPrincipalToken("not-a-token", "a-secret-with-enough-entropy", "api", 1_000),
		undefined,
	);
});

test("principal tokens are rejected by every other service audience", () => {
	const secret = "a-secret-with-enough-entropy";
	for (const audience of ["api", "realtime", "activity"] as const) {
		const token = issuePrincipalToken(principal, audience, secret, 2_000);
		for (const other of ["api", "realtime", "activity"] as const) {
			assert.deepEqual(
				verifyPrincipalToken(token, secret, other, 1_000),
				audience === other ? principal : undefined,
				`${audience} token checked as ${other}`,
			);
		}
	}
});

test("signed principal with an unknown capability is rejected", () => {
	const token = issuePrincipalToken(
		{ ...principal, permissions: ["unknown:grant"] } as unknown as Principal,
		"api",
		"secret",
		2_000,
	);
	assert.equal(verifyPrincipalToken(token, "secret", "api", 1_000), undefined);
});
