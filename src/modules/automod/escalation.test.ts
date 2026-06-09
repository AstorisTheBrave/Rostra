import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEscalation, type Severity } from "./escalation.ts";

const rep = (severity: Severity, times: number): Severity[] => Array(times).fill(severity);

test("KICK lands at exactly 3 HIGH offenses", () => {
	assert.equal(resolveEscalation(rep("HIGH", 0), "HIGH").action, "TIMEOUT");
	assert.equal(resolveEscalation(rep("HIGH", 1), "HIGH").action, "TIMEOUT");
	assert.equal(resolveEscalation(rep("HIGH", 2), "HIGH").action, "KICK");
});

test("KICK lands at exactly 5 MEDIUM and 7 LOW offenses", () => {
	assert.equal(resolveEscalation(rep("MEDIUM", 3), "MEDIUM").action, "TIMEOUT");
	assert.equal(resolveEscalation(rep("MEDIUM", 4), "MEDIUM").action, "KICK");
	assert.equal(resolveEscalation(rep("LOW", 5), "LOW").action, "TIMEOUT");
	assert.equal(resolveEscalation(rep("LOW", 6), "LOW").action, "KICK");
});

test("BAN lands at 5 HIGH offenses", () => {
	assert.equal(resolveEscalation(rep("HIGH", 3), "HIGH").action, "KICK");
	assert.equal(resolveEscalation(rep("HIGH", 4), "HIGH").action, "BAN");
});

test("never kicks or bans on the first offense, whatever the severity", () => {
	const r = resolveEscalation([], "HIGH");
	assert.equal(r.offenseCount, 1);
	assert.notEqual(r.action, "KICK");
	assert.notEqual(r.action, "BAN");
	assert.equal(r.action, "TIMEOUT");
});

test("a lone low-severity first offense only warns", () => {
	assert.equal(resolveEscalation([], "LOW").action, "WARN");
});

test("TIMEOUT carries a severity-scaled duration; other actions carry none", () => {
	assert.equal(resolveEscalation([], "HIGH").timeoutMs, 24 * 60 * 60 * 1000);
	// 3 LOW = 45 pts -> TIMEOUT (2 LOW = 30 is still WARN).
	assert.equal(resolveEscalation(rep("LOW", 2), "LOW").timeoutMs, 1 * 60 * 60 * 1000);
	assert.equal(resolveEscalation(rep("HIGH", 2), "HIGH").timeoutMs, null); // KICK -> no timeout
});
