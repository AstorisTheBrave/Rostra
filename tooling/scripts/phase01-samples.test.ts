import assert from "node:assert/strict";
import test from "node:test";
import { recordAuthorizationSample } from "./phase01-samples.ts";

test("authorization sample records only its request duration and observed database calls", async () => {
	const samples = { requestLatencyMs: [] as number[], databaseQueryCount: [] as number[] };
	const times = [10, 17];
	let authorizationCalls = 0;
	await recordAuthorizationSample(
		samples,
		async () => {
			authorizationCalls++;
			return 1;
		},
		() => times.shift() ?? 0,
	);

	assert.deepEqual(samples, { requestLatencyMs: [7], databaseQueryCount: [1] });
	assert.equal(authorizationCalls, 1);
});

test("authorization sample uses the default monotonic clock", async () => {
	const samples = { requestLatencyMs: [] as number[], databaseQueryCount: [] as number[] };
	await recordAuthorizationSample(samples, async () => 1);

	assert.equal(samples.databaseQueryCount[0], 1);
	assert.ok(Number.isFinite(samples.requestLatencyMs[0]));
	assert.ok((samples.requestLatencyMs[0] ?? -1) >= 0);
});
