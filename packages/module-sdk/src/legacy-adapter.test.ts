import assert from "node:assert/strict";
import test from "node:test";
import { adaptLegacyModule, adaptLegacyModules } from "./legacy-adapter.ts";
import { superviseModuleLifecycles } from "./lifecycle.ts";

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

test("legacy lifecycle defers stop after cancellation until explicitly stopped", async () => {
	let stops = 0;
	const [adapted] = adaptLegacyModules([
		{ name: "sample", lifecycle: { stop: async () => void stops++ } },
	]);
	const controller = new AbortController();
	await adapted?.lifecycle.start(controller.signal);
	controller.abort();
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(stops, 0);
	await adapted?.lifecycle.stop();
	await adapted?.lifecycle.stop();
	assert.equal(stops, 1);
});

test("legacy cancellation keeps a failed stop observable during shutdown", async () => {
	const [adapted] = adaptLegacyModules([
		{
			name: "sample",
			lifecycle: {
				stop: () => {
					throw new Error("stop failed");
				},
			},
		},
	]);
	assert.ok(adapted);
	const controller = new AbortController();
	await adapted.lifecycle.start(controller.signal);
	assert.doesNotThrow(() => controller.abort());
	await assert.rejects(adapted.lifecycle.stop(), /stop failed/);
	await assert.rejects(adapted.lifecycle.stop(), /stop failed/);
});

test("legacy adapter forwards disposal", async () => {
	let disposed = false;
	const adapted = adaptLegacyModule({
		name: "sample",
		lifecycle: {
			dispose: () => {
				disposed = true;
			},
		},
	});
	await adapted.lifecycle.dispose?.();
	assert.equal(disposed, true);
});

test("supervised legacy shutdown waits for asynchronous drain before stop and disposal", async () => {
	const calls: string[] = [];
	let finishDrain = () => {};
	const draining = new Promise<void>((resolve) => {
		finishDrain = resolve;
	});
	const adapted = adaptLegacyModule({
		name: "sample",
		lifecycle: {
			start: async (signal) => {
				signal.addEventListener("abort", () => calls.push("abort"), { once: true });
			},
			drain: async () => {
				calls.push("drain");
				await draining;
				calls.push("drained");
			},
			stop: async () => {
				calls.push("stop");
			},
			dispose: () => {
				calls.push("dispose");
			},
		},
	});
	const supervisor = superviseModuleLifecycles([
		{ id: adapted.manifest.id, enabled: true, lifecycle: adapted.lifecycle },
	]);
	await supervisor.start();
	const stopping = supervisor.stop();
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.deepEqual(calls, ["abort", "drain"]);
	finishDrain();
	assert.deepEqual(await stopping, []);
	assert.deepEqual(calls, ["abort", "drain", "drained", "stop", "dispose"]);
});

test("legacy adapter uses registry-owned manifest and rejects a mismatched runtime", () => {
	const manifest = {
		schemaVersion: 1 as const,
		id: "sample",
		version: "1.0.0",
		runtimePlacement: "gateway" as const,
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
		resourceBudgets: {},
		health: {},
	};
	const adapted = adaptLegacyModule(
		{ name: "sample", commands: [{ data: { name: "ping" } }] },
		manifest,
	);
	assert.deepEqual(adapted.manifest.commands, ["ping"]);
	assert.throws(() => adaptLegacyModule({ name: "wrong" }, manifest), /sample.*wrong/);
});
