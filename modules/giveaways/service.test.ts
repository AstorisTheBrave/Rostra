import assert from "node:assert/strict";
import { test } from "node:test";
import { checkEntry, pickWinners } from "./service.ts";

const noReq = { reqRoleId: null, reqLevel: 0, reqAccountDays: 0 };

test("checkEntry passes when there are no requirements", () => {
	assert.deepEqual(checkEntry({ hasRole: false, level: 0, accountAgeDays: 0, req: noReq }), {
		ok: true,
	});
});

test("checkEntry enforces the required role", () => {
	const req = { ...noReq, reqRoleId: "r1" };
	assert.deepEqual(checkEntry({ hasRole: false, level: 99, accountAgeDays: 99, req }), {
		ok: false,
		reason: "role",
	});
	assert.deepEqual(checkEntry({ hasRole: true, level: 0, accountAgeDays: 0, req }), { ok: true });
});

test("checkEntry enforces the minimum level", () => {
	const req = { ...noReq, reqLevel: 10 };
	assert.deepEqual(checkEntry({ hasRole: true, level: 9, accountAgeDays: 0, req }), {
		ok: false,
		reason: "level",
	});
	assert.deepEqual(checkEntry({ hasRole: true, level: 10, accountAgeDays: 0, req }), { ok: true });
});

test("checkEntry enforces the minimum account age", () => {
	const req = { ...noReq, reqAccountDays: 30 };
	assert.deepEqual(checkEntry({ hasRole: true, level: 0, accountAgeDays: 29.9, req }), {
		ok: false,
		reason: "age",
	});
	assert.deepEqual(checkEntry({ hasRole: true, level: 0, accountAgeDays: 30, req }), { ok: true });
});

test("checkEntry reports the role gate before level and age", () => {
	const req = { reqRoleId: "r1", reqLevel: 10, reqAccountDays: 30 };
	assert.deepEqual(checkEntry({ hasRole: false, level: 1, accountAgeDays: 1, req }), {
		ok: false,
		reason: "role",
	});
});

test("pickWinners returns the requested count of unique entries", () => {
	const entries = ["a", "b", "c", "d", "e"];
	const winners = pickWinners(entries, 3);
	assert.equal(winners.length, 3);
	assert.equal(new Set(winners).size, 3);
	for (const w of winners) assert.ok(entries.includes(w));
});

test("pickWinners caps at the number of entries and dedupes", () => {
	assert.equal(pickWinners(["a", "a", "b"], 5).length, 2);
	assert.deepEqual(pickWinners([], 3), []);
});
