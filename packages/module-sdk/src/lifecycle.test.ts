import assert from "node:assert/strict";
import test from "node:test";
import { superviseModuleLifecycles } from "./lifecycle.ts";

test("disabled modules are deterministic lifecycle no-ops", async () => {
	let calls = 0;
	const supervisor = superviseModuleLifecycles([
		{
			id: "off",
			enabled: false,
			lifecycle: {
				start: async () => {
					calls++;
				},
				drain: async () => {
					calls++;
				},
				stop: async () => {
					calls++;
				},
			},
		},
	]);
	assert.deepEqual(await supervisor.start(), []);
	assert.deepEqual(await supervisor.stop(), []);
	assert.equal(calls, 0);
});

test("one module start failure does not prevent another module from starting", async () => {
	const calls: string[] = [];
	const supervisor = superviseModuleLifecycles([
		{
			id: "a",
			enabled: true,
			lifecycle: {
				start: async () => {
					throw new Error("boom");
				},
			},
		},
		{
			id: "b",
			enabled: true,
			lifecycle: {
				start: async () => {
					calls.push("b");
				},
			},
		},
	]);
	assert.deepEqual(
		(await supervisor.start()).map((failure) => failure.id),
		["a"],
	);
	assert.deepEqual(calls, ["b"]);
});

test("stop aborts owned work and drains and disposes all modules despite failures", async () => {
	const calls: string[] = [];
	let signal: AbortSignal | undefined;
	const supervisor = superviseModuleLifecycles([
		{
			id: "a",
			enabled: true,
			lifecycle: {
				start: async (owned) => {
					signal = owned;
				},
				drain: async () => {
					calls.push("drain-a");
					throw new Error("drain failed");
				},
				stop: async () => {
					calls.push("stop-a");
				},
			},
		},
		{
			id: "b",
			enabled: true,
			lifecycle: {
				drain: async () => {
					calls.push("drain-b");
				},
				stop: async () => {
					calls.push("stop-b");
				},
			},
		},
	]);
	await supervisor.start();
	assert.deepEqual(
		(await supervisor.stop()).map((failure) => [failure.id, failure.phase]),
		[["a", "drain"]],
	);
	assert.equal(signal?.aborted, true);
	assert.deepEqual(calls, ["drain-a", "drain-b", "stop-a", "stop-b"]);
	assert.deepEqual(await supervisor.stop(), []);
});

test("stop waits for an in-flight start and never starts later modules", async () => {
	const calls: string[] = [];
	let finishStart = () => {};
	const starting = new Promise<void>((resolve) => {
		finishStart = resolve;
	});
	let signal: AbortSignal | undefined;
	const supervisor = superviseModuleLifecycles([
		{
			id: "a",
			enabled: true,
			lifecycle: {
				start: async (owned) => {
					signal = owned;
					calls.push("start-a");
					await starting;
					calls.push("started-a");
				},
				drain: async () => {
					calls.push("drain-a");
				},
				stop: async () => {
					calls.push("stop-a");
				},
				dispose: () => {
					calls.push("dispose-a");
				},
			},
		},
		{
			id: "b",
			enabled: true,
			lifecycle: {
				start: async () => {
					calls.push("start-b");
				},
				stop: async () => {
					calls.push("stop-b");
				},
			},
		},
	]);
	const start = supervisor.start();
	let stopped = false;
	const stop = supervisor.stop().then(() => {
		stopped = true;
	});
	let stoppedAgain = false;
	const stopAgain = supervisor.stop().then(() => {
		stoppedAgain = true;
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.equal(signal?.aborted, true);
	assert.equal(stopped, false);
	assert.equal(stoppedAgain, false);
	assert.deepEqual(calls, ["start-a"]);
	finishStart();
	await Promise.all([start, stop, stopAgain]);
	assert.deepEqual(calls, ["start-a", "started-a", "drain-a", "stop-a", "dispose-a"]);
	assert.deepEqual(await supervisor.start(), []);
});
