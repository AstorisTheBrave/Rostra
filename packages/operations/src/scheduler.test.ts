import assert from "node:assert/strict";
import { test } from "node:test";
import {
	PermanentScheduledTaskError,
	parseScheduledTaskDispatch,
	requireTaskPayload,
	scheduledRetryAt,
} from "./scheduler.ts";

test("dispatch envelope admits only exact versioned task identity", () => {
	assert.deepEqual(parseScheduledTaskDispatch({ version: 1, taskId: "task_1", claimVersion: 2 }), {
		version: 1,
		taskId: "task_1",
		claimVersion: 2,
	});
	for (const value of [
		null,
		{},
		{ version: 2, taskId: "x", claimVersion: 1 },
		{ version: 1, taskId: "x", claimVersion: 0 },
		{ version: 1, taskId: "x", claimVersion: 1, payload: {} },
		{ version: 1, taskId: "x", claimVersion: 1.5 },
	])
		assert.equal(parseScheduledTaskDispatch(value), null);
});

test("payload validation rejects malformed and non-snowflake identifiers", () => {
	assert.equal(requireTaskPayload({ guildId: "123" }, ["guildId"]).guildId, "123");
	assert.throws(
		() => requireTaskPayload({ guildId: "other" }, ["guildId"]),
		PermanentScheduledTaskError,
	);
	assert.throws(() => requireTaskPayload([], ["guildId"]), PermanentScheduledTaskError);
});

test("retry delay grows but is capped", () => {
	const now = new Date(0);
	assert.equal(scheduledRetryAt(1, now).getTime(), 5_000);
	assert.equal(scheduledRetryAt(2, now).getTime(), 10_000);
	assert.equal(scheduledRetryAt(100, now).getTime(), 300_000);
});
