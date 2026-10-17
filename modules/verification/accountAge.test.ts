import assert from "node:assert/strict";
import { test } from "node:test";
import { accountAgeDays, accountCreatedAt, eligibleAt } from "./accountAge.ts";

const DISCORD_EPOCH_MS = 1420070400000;

test("accountCreatedAt decodes the snowflake timestamp", () => {
	// id with 0 timestamp bits -> the Discord epoch.
	assert.equal(accountCreatedAt("00000000000000000")?.getTime(), DISCORD_EPOCH_MS);
	assert.equal(accountCreatedAt("not-a-snowflake"), null);
});

test("accountAgeDays returns Infinity for a malformed id (never trips the gate)", () => {
	assert.equal(accountAgeDays("nope"), Number.POSITIVE_INFINITY);
});

test("accountAgeDays measures age against a fixed now", () => {
	const tenDaysAfterEpoch = DISCORD_EPOCH_MS + 10 * 86_400_000;
	assert.equal(Math.round(accountAgeDays("00000000000000000", tenDaysAfterEpoch)), 10);
});

test("eligibleAt is creation plus minDays", () => {
	const e = eligibleAt("00000000000000000", 7);
	assert.equal(e?.getTime(), DISCORD_EPOCH_MS + 7 * 86_400_000);
	assert.equal(eligibleAt("bad", 7), null);
});
