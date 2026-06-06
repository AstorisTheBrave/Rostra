import assert from "node:assert/strict";
import { test } from "node:test";
import setup from "./index.ts";

test("setup module exposes /setup and a setup component", () => {
	assert.equal(setup.name, "setup");
	assert.equal(setup.commands?.[0]?.data.name, "setup");
	assert.equal(setup.components?.[0]?.prefix, "setup");
});

test("setup i18n covers the panel strings", () => {
	for (const key of ["title", "intro", "applyBaseline", "createLog", "logSet", "logNone"]) {
		assert.ok(setup.i18n?.[key], `missing i18n key ${key}`);
	}
});
