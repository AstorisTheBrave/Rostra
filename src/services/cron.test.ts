import assert from "node:assert/strict";
import { test } from "node:test";
import { listCronJobs, registerCron, startCron, stopCron } from "./cron.ts";

test("registerCron adds jobs and runOnStart fires immediately", async () => {
	const before = listCronJobs().length;
	let ran = 0;
	registerCron({
		name: `test-${Math.random()}`,
		everyMs: 1_000_000,
		runOnStart: true,
		handler: () => {
			ran++;
		},
	});
	assert.equal(listCronJobs().length, before + 1);

	startCron();
	await new Promise((r) => setTimeout(r, 5));
	assert.ok(ran >= 1, "runOnStart handler should have fired");
	stopCron();
});
