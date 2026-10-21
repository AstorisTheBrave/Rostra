import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyFlagMessage,
	isDeclared,
	isFeatureLive,
	listFeatures,
	loadFeatureFlags,
	registerFeature,
	setFeatureLive,
} from "./featureFlags.ts";

function deferredRows() {
	let resolve!: (rows: { name: string; enabled: boolean }[]) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<{ name: string; enabled: boolean }[]>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

test("failed initial load retains a buffered off switch across a stale retry", async () => {
	registerFeature("bufferedInitialFailure", true);
	registerFeature("beforeRead", true);
	applyFlagMessage({ name: "beforeRead", enabled: true });
	assert.equal(isFeatureLive("bufferedInitialFailure"), false);
	const read = deferredRows();
	const loading = loadFeatureFlags(() => read.promise);
	applyFlagMessage({ name: "bufferedInitialFailure", enabled: false });
	read.reject(new Error("database unavailable"));
	await assert.rejects(loading);
	assert.equal(isFeatureLive("bufferedInitialFailure"), false);
	const retry = deferredRows();
	const retried = loadFeatureFlags(() => retry.promise);
	retry.resolve([
		{ name: "bufferedInitialFailure", enabled: true },
		{ name: "beforeRead", enabled: false },
	]);
	await retried;
	assert.equal(isFeatureLive("bufferedInitialFailure"), false);
	assert.equal(isFeatureLive("beforeRead"), false);
});

test("a stale reload cannot overwrite a concurrent bus update, and concurrent loads coalesce", async () => {
	registerFeature("reloadRace", true);
	const read = deferredRows();
	const loading = loadFeatureFlags(() => read.promise);
	let secondReadCalls = 0;
	const concurrent = loadFeatureFlags(async () => {
		secondReadCalls++;
		return [{ name: "reloadRace", enabled: true }];
	});
	assert.strictEqual(concurrent, loading);
	applyFlagMessage({ name: "reloadRace", enabled: false });
	read.resolve([{ name: "reloadRace", enabled: true }]);
	await loading;
	assert.equal(secondReadCalls, 0);
	assert.equal(isFeatureLive("reloadRace"), false);
});

test("failed reload retains bus updates delivered while its database read was pending", async () => {
	registerFeature("failedReloadRace", true);
	const read = deferredRows();
	const loading = loadFeatureFlags(() => read.promise);
	applyFlagMessage({ name: "failedReloadRace", enabled: false });
	read.reject(new Error("database unavailable"));
	await assert.rejects(loading);
	assert.equal(isFeatureLive("failedReloadRace"), false);
});

test("reload failure retains persisted off overrides", async () => {
	registerFeature("persistedOff", true);
	await loadFeatureFlags(async () => [{ name: "persistedOff", enabled: false }]);
	await assert.rejects(
		loadFeatureFlags(async () => {
			throw new Error("database unavailable");
		}),
	);
	assert.equal(isFeatureLive("persistedOff"), false);
});

test("committed flag write reports Redis publication degradation", async () => {
	registerFeature("degradedPublish", true);
	const result = await setFeatureLive("degradedPublish", false, {
		write: async () => {},
		publish: async () => ({ status: "ttl-fallback", reason: "publish-failed" }),
	});
	assert.equal(result.status, "ttl-fallback");
	assert.equal(isFeatureLive("degradedPublish"), false);
});

test("committed flag write still reports degradation if publication throws", async () => {
	registerFeature("rejectedPublish", true);
	const result = await setFeatureLive("rejectedPublish", false, {
		write: async () => {},
		publish: async () => {
			throw new Error("redis disconnected");
		},
	});
	assert.equal(result.status, "ttl-fallback");
	assert.equal(isFeatureLive("rejectedPublish"), false);
});

test("database write failure leaves the known global flag unchanged", async () => {
	registerFeature("failedFlagWrite", true);
	await assert.rejects(
		setFeatureLive("failedFlagWrite", false, {
			write: async () => {
				throw new Error("database unavailable");
			},
			publish: async () => ({ status: "published" }),
		}),
	);
	assert.equal(isFeatureLive("failedFlagWrite"), true);
});

test("registerFeature sets a default and isFeatureLive reads it (dormant = off)", () => {
	registerFeature("demoDormant"); // default off
	registerFeature("demoOn", true);
	assert.equal(isFeatureLive("demoDormant"), false);
	assert.equal(isFeatureLive("demoOn"), true);
	assert.equal(isFeatureLive("neverDeclared"), false);
});

test("registerFeature does not clobber an existing default", () => {
	registerFeature("demoStable", true);
	registerFeature("demoStable", false); // ignored - already declared
	assert.equal(isFeatureLive("demoStable"), true);
});

test("a live override (bus message) beats the default", () => {
	registerFeature("demoFlip", true);
	applyFlagMessage({ name: "demoFlip", enabled: false }); // kill-switch
	assert.equal(isFeatureLive("demoFlip"), false);
	applyFlagMessage({ name: "demoFlip", enabled: true });
	assert.equal(isFeatureLive("demoFlip"), true);
});

test("applyFlagMessage ignores malformed payloads", () => {
	registerFeature("demoSafe", true);
	applyFlagMessage({ name: "demoSafe" }); // no enabled
	applyFlagMessage(null);
	applyFlagMessage({ enabled: false }); // no name
	assert.equal(isFeatureLive("demoSafe"), true);
});

test("isDeclared and listFeatures reflect registrations", () => {
	registerFeature("demoListed", true);
	assert.equal(isDeclared("demoListed"), true);
	assert.equal(isDeclared("ghost"), false);
	const listed = listFeatures().find((f) => f.name === "demoListed");
	assert.deepEqual(listed, { name: "demoListed", default: true, live: true });
});
