import assert from "node:assert/strict";
import { test } from "node:test";
import { clampDelay, shouldArm } from "./scheduler.ts";

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
