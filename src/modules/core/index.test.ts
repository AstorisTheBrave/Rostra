import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModules } from "@/client/loaders/modules.ts";

test("core module loads with ping and help commands", async () => {
	const modules = await loadModules();
	const core = modules.find((m) => m.name === "core");
	assert.ok(core, "core module should be discovered");
	const names = (core?.commands ?? []).map((c) => c.data.name).sort();
	assert.deepEqual(names, ["help", "ping"]);
});
