import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("loadModules discovers a fixture module with its command", async () => {
	const { loadModules } = await import("./modules.ts");
	const dir = fileURLToPath(new URL("./__fixtures__", import.meta.url));
	const modules = await loadModules(dir);
	assert.equal(modules.length, 1);
	assert.equal(modules[0]?.name, "sample");
	assert.equal(modules[0]?.commands?.[0]?.data.name, "sample");
});

test("loadModules returns empty for a missing directory", async () => {
	const { loadModules } = await import("./modules.ts");
	const modules = await loadModules("/no/such/dir/here");
	assert.deepEqual(modules, []);
});
