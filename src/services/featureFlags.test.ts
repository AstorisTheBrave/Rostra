import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyFlagMessage,
	isDeclared,
	isFeatureLive,
	listFeatures,
	registerFeature,
} from "./featureFlags.ts";

test("registerFeature sets a default and isFeatureLive reads it (dormant = off)", () => {
	registerFeature("demoDormant"); // default off
	registerFeature("demoOn", true);
	assert.equal(isFeatureLive("demoDormant"), false);
	assert.equal(isFeatureLive("demoOn"), true);
	assert.equal(isFeatureLive("neverDeclared"), false);
});

test("registerFeature does not clobber an existing default", () => {
	registerFeature("demoStable", true);
	registerFeature("demoStable", false); // ignored - already declared
	assert.equal(isFeatureLive("demoStable"), true);
});

test("a live override (bus message) beats the default", () => {
	registerFeature("demoFlip", true);
	applyFlagMessage({ name: "demoFlip", enabled: false }); // kill-switch
	assert.equal(isFeatureLive("demoFlip"), false);
	applyFlagMessage({ name: "demoFlip", enabled: true });
	assert.equal(isFeatureLive("demoFlip"), true);
});

test("applyFlagMessage ignores malformed payloads", () => {
	registerFeature("demoSafe", true);
	applyFlagMessage({ name: "demoSafe" }); // no enabled
	applyFlagMessage(null);
	applyFlagMessage({ enabled: false }); // no name
	assert.equal(isFeatureLive("demoSafe"), true);
});

test("isDeclared and listFeatures reflect registrations", () => {
	registerFeature("demoListed", true);
	assert.equal(isDeclared("demoListed"), true);
	assert.equal(isDeclared("ghost"), false);
	const listed = listFeatures().find((f) => f.name === "demoListed");
	assert.deepEqual(listed, { name: "demoListed", default: true, live: true });
});
