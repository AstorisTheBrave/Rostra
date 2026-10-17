import assert from "node:assert/strict";
import { test } from "node:test";

test("in-memory enqueue runs the registered handler", async () => {
	const { registerJob, enqueue } = await import("./queue.ts");
	let received: unknown;
	await registerJob({
		name: "test-job",
		handler: (payload) => {
			received = payload;
		},
	});
	await enqueue("test-job", { x: 1 });
	assert.deepEqual(received, { x: 1 });
});

test("enqueue for an unknown job is a no-op", async () => {
	const { enqueue } = await import("./queue.ts");
	await enqueue("nope", { y: 2 });
	assert.ok(true);
});
