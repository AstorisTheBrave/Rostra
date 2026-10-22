import assert from "node:assert/strict";
import test from "node:test";
import { orderModuleRegistry } from "./registry.ts";

const entry = (
	id: string,
	version = "1.0.0",
	dependencies: { id: string; version: string }[] = [],
) => ({
	manifest: {
		schemaVersion: 1 as const,
		id,
		version,
		runtimePlacement: "gateway" as const,
		dependencies,
		capabilities: [],
		intents: [],
		permissions: [],
		settingsOwnership: [],
		commands: [],
		routes: [],
		events: [],
		jobs: [],
		externalScopes: [],
		resourceBudgets: {},
		health: {},
	},
});

test("registry rejects duplicate IDs", () => {
	assert.throws(
		() => orderModuleRegistry([entry("same"), entry("same")]),
		/Duplicate module id: same/,
	);
});

test("registry rejects missing and incompatible dependencies", () => {
	assert.throws(
		() => orderModuleRegistry([entry("second", "1.0.0", [{ id: "first", version: "^1.0.0" }])]),
		/second.*missing dependency first/i,
	);
	assert.throws(
		() =>
			orderModuleRegistry([
				entry("second", "1.0.0", [{ id: "first", version: "^2.0.0" }]),
				entry("first"),
			]),
		/second.*incompatible dependency first/i,
	);
});

test("registry rejects dependency cycles", () => {
	assert.throws(
		() =>
			orderModuleRegistry([
				entry("a", "1.0.0", [{ id: "b", version: "^1.0.0" }]),
				entry("b", "1.0.0", [{ id: "a", version: "^1.0.0" }]),
			]),
		/dependency cycle.*a.*b/i,
	);
});

test("registry orders dependencies first and independent IDs lexically", () => {
	const ordered = orderModuleRegistry([
		entry("z"),
		entry("a", "1.0.0", [{ id: "b", version: "^1.0.0" }]),
		entry("b"),
		entry("c"),
		entry("aZ"),
		entry("aa"),
	]);
	assert.deepEqual(
		ordered.map((value) => value.manifest.id),
		["aZ", "aa", "b", "a", "c", "z"],
	);
});
