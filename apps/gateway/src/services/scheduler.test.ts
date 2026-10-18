import assert from "node:assert/strict";
import { test } from "node:test";
import { clampDelay, dispatchScheduledTask, settleScheduledTask, shouldArm } from "./scheduler.ts";

test("clampDelay floors at 0 and caps at the setTimeout max", () => {
	assert.equal(clampDelay(-5), 0);
	assert.equal(clampDelay(1000), 1000);
	assert.equal(clampDelay(10_000_000_000), 2_147_483_000);
});

test("shouldArm runs guild tasks on the owning shard", () => {
	const owns = (g: string) => g === "g1";
	assert.equal(shouldArm({ guildId: "g1" }, 3, owns), true);
	assert.equal(shouldArm({ guildId: "g2" }, 3, owns), false);
});

test("shouldArm runs global tasks only on shard 0", () => {
	const owns = () => true;
	assert.equal(shouldArm({ guildId: null }, 0, owns), true);
	assert.equal(shouldArm({ guildId: null }, 1, owns), false);
});

test("scheduled task failures and missing handlers are retained outcomes", async () => {
	const client = {} as never;
	assert.deepEqual(await dispatchScheduledTask(undefined, {}, client), {
		completed: false,
		code: "unknown_handler",
	});
	const failed = await dispatchScheduledTask(
		async () => {
			throw new Error("private detail");
		},
		{},
		client,
	);
	assert.equal(failed.completed, false);
	if (!failed.completed) assert.equal(failed.code, "handler_failed");
});

test("failed scheduled tasks are marked failed and never deleted", async () => {
	let deletes = 0;
	let update: unknown;
	await settleScheduledTask(
		{
			async deleteMany() {
				deletes++;
			},
			async updateMany(input) {
				update = input;
			},
		},
		"task-1",
		{ completed: false, code: "handler_failed" },
	);
	assert.equal(deletes, 0);
	assert.deepEqual(update, {
		where: { id: "task-1", status: "pending" },
		data: { status: "failed", attempts: { increment: 1 }, lastError: "handler_failed" },
	});
});
