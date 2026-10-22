import assert from "node:assert/strict";
import test from "node:test";
import { validateModuleManifest } from "./manifest.ts";

const valid = () => ({
	schemaVersion: 1,
	id: "sample",
	version: "1.2.3",
	runtimePlacement: "gateway",
	dependencies: [],
	capabilities: [],
	intents: [],
	permissions: [],
	settingsOwnership: [],
	commands: [],
	routes: [],
	events: [],
	jobs: [],
	externalScopes: [],
	resourceBudgets: { concurrency: 0 },
	health: { readiness: "loaded", liveness: "gateway" },
});

test("manifest rejects unstable or malformed versions", () => {
	for (const version of ["", "1", "01.2.3", "1.2.3-beta.1", "v1.2.3", "1.2.3.4"])
		assert.throws(() => validateModuleManifest({ ...valid(), version }), /sample.*version/i);
});

test("manifest rejects unknown schema versions", () => {
	assert.throws(() => validateModuleManifest({ ...valid(), schemaVersion: 2 }), /sample.*schema/i);
});

test("manifest rejects invalid budgets and duplicate arrays", () => {
	for (const budget of [-1, Number.NaN, Number.POSITIVE_INFINITY])
		assert.throws(
			() => validateModuleManifest({ ...valid(), resourceBudgets: { concurrency: budget } }),
			/sample.*resourceBudgets.*concurrency/i,
		);
	assert.throws(
		() => validateModuleManifest({ ...valid(), commands: ["ping", "ping"] }),
		/sample.*duplicate commands/i,
	);
});
