import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentVerifyKick } from "./events.ts";

test("verification auto-kick ignores old joins, old role config, and legacy tasks", () => {
	const joinedAt = 1_700_000_000_000;
	const payload = { joinedAt, roleId: "verified", kickAfterMin: 10 };
	const due = joinedAt + 10 * 60_000;
	assert.equal(isCurrentVerifyKick(payload, joinedAt, "verified", 10, due), true);
	assert.equal(isCurrentVerifyKick(payload, joinedAt + 1000, "verified", 10, due), false);
	assert.equal(isCurrentVerifyKick(payload, joinedAt, "new-role", 10, due), false);
	assert.equal(isCurrentVerifyKick(payload, joinedAt, "verified", 20, due), false);
	assert.equal(isCurrentVerifyKick(payload, joinedAt, "verified", 10, due - 1), false);
	assert.equal(isCurrentVerifyKick({ joinedAt }, joinedAt, "verified", 10, due), false);
	assert.equal(isCurrentVerifyKick({}, joinedAt, "verified", 10, due), false);
});
