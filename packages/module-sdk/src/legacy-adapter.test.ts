import assert from "node:assert/strict";
import test from "node:test";
import { adaptLegacyModules } from "./legacy-adapter.ts";

test("legacy adapter validates inventory and rejects duplicate ids", () => {
	const [adapted] = adaptLegacyModules([
		{
			name: "sample",
			commands: [{ data: { name: "ping" } }],
			events: [{ name: "ready" }],
		},
	]);
	assert.equal(adapted?.manifest.id, "sample");
	assert.deepEqual(adapted?.manifest.capabilities, ["commands", "events"]);
	assert.throws(
		() => adaptLegacyModules([{ name: "same" }, { name: "same" }]),
		/Duplicate module id/,
	);
});

test("legacy lifecycle stops once when its signal is cancelled", async () => {
	let stops = 0;
	const [adapted] = adaptLegacyModules([
		{ name: "sample", lifecycle: { stop: async () => void stops++ } },
	]);
	const controller = new AbortController();
	await adapted?.lifecycle.start(controller.signal);
	controller.abort();
	await adapted?.lifecycle.stop();
	assert.equal(stops, 1);
});
