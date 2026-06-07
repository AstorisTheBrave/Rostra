import assert from "node:assert/strict";
import { test } from "node:test";
import verification from "./index.ts";

test("verification module exposes the command and verify component", () => {
	assert.equal(verification.name, "verification");
	assert.equal(verification.commands?.[0]?.data.name, "verification");
	assert.equal(verification.components?.[0]?.prefix, "verify");
});

test("verification i18n covers the panel + outcomes", () => {
	for (const key of ["panel.title", "panel.button", "welcome", "already", "off"]) {
		assert.ok(verification.i18n?.[key], `missing i18n key ${key}`);
	}
});
