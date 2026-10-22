import assert from "node:assert/strict";
import test from "node:test";
import type { JobDefinition } from "@rostra/contracts";

test("job contracts accept synchronous and asynchronous handlers with unknown payloads", async () => {
	const seen: unknown[] = [];
	const jobs: JobDefinition[] = [
		{
			name: "sync",
			handler: (payload) => {
				seen.push(payload);
			},
		},
		{
			name: "async",
			handler: async (payload) => {
				seen.push(payload);
			},
		},
	];
	for (const job of jobs) await job.handler({ tenant: "example" });
	assert.deepEqual(seen, [{ tenant: "example" }, { tenant: "example" }]);
});
