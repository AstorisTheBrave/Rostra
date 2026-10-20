import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("checked-in registry loads the canonical 42 modules in deterministic order", async () => {
	const { loadModuleRegistry } = await import("./modules.ts");
	const fixture = JSON.parse(
		readFileSync(
			new URL("../../../../../tooling/fixtures/gateway-modules.json", import.meta.url),
			"utf8",
		),
	) as {
		modules: Array<{ name: string }>;
	};
	const loaded = await loadModuleRegistry();
	assert.equal(loaded.length, 42);
	assert.deepEqual(
		loaded.map((entry) => entry.manifest.id),
		fixture.modules.map((module) => module.name),
	);
	assert.deepEqual(
		loaded.map((entry) => entry.module.name),
		fixture.modules.map((module) => module.name),
	);
});

test("a checked-in manifest dependency controls gateway load order", async () => {
	const { moduleRegistry } = await import("@/modules/registry.ts");
	const { loadModuleRegistry } = await import("./modules.ts");
	const entry = moduleRegistry.find(({ manifest }) => manifest.id === "ai");
	assert.ok(entry);
	const original = entry.manifest;
	entry.manifest = {
		...original,
		dependencies: [{ id: "welcome", version: "^1.0.0" }],
		health: { ...original.health, readiness: "dependency-checked" },
	};
	try {
		const loaded = await loadModuleRegistry();
		const ids = loaded.map(({ manifest }) => manifest.id);
		assert.ok(ids.indexOf("welcome") < ids.indexOf("ai"));
		assert.deepEqual(loaded.find(({ manifest }) => manifest.id === "ai")?.manifest.dependencies, [
			{ id: "welcome", version: "^1.0.0" },
		]);
		assert.equal(
			loaded.find(({ manifest }) => manifest.id === "ai")?.manifest.health.readiness,
			"dependency-checked",
		);
	} finally {
		entry.manifest = original;
	}
});
