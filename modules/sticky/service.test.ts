import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStickyContent, STICKY_PREFIX } from "./service.ts";

test("buildStickyContent adds the pin marker once", () => {
	assert.equal(buildStickyContent("Read the rules"), `${STICKY_PREFIX} Read the rules`);
	assert.equal(
		buildStickyContent(`${STICKY_PREFIX} Already pinned`),
		`${STICKY_PREFIX} Already pinned`,
	);
});

test("buildStickyContent trims and clamps to 2000 chars", () => {
	assert.equal(buildStickyContent("   spaced   "), `${STICKY_PREFIX} spaced`);
	const long = "x".repeat(3000);
	assert.equal(buildStickyContent(long).length, 2000);
});
