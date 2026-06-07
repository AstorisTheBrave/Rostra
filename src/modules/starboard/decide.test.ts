import assert from "node:assert/strict";
import { test } from "node:test";
import { decideStarboard, earnsReward } from "./service.ts";

test("decideStarboard posts at or above the threshold", () => {
	assert.equal(decideStarboard(3, 3, null, false), "post");
	assert.equal(decideStarboard(5, 3, null, true), "post");
});

test("decideStarboard does nothing below threshold with no existing post", () => {
	assert.equal(decideStarboard(2, 3, null, false), "none");
});

test("decideStarboard removes a post once stars fall below the floor", () => {
	// no separate floor -> floor is the threshold
	assert.equal(decideStarboard(2, 3, null, true), "remove");
});

test("decideStarboard keeps a post in the hysteresis band", () => {
	// threshold 5, floor 3: a posted message at 4 stars stays (keep), at 2 drops (remove)
	assert.equal(decideStarboard(4, 5, 3, true), "keep");
	assert.equal(decideStarboard(2, 5, 3, true), "remove");
	assert.equal(decideStarboard(3, 5, 3, true), "keep");
});

test("earnsReward only fires when enabled and reached", () => {
	assert.equal(earnsReward(10, 0), false); // disabled
	assert.equal(earnsReward(9, 10), false);
	assert.equal(earnsReward(10, 10), true);
	assert.equal(earnsReward(12, 10), true);
});
