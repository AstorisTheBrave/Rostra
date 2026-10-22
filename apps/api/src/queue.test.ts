import assert from "node:assert/strict";
import { test } from "node:test";
import { createOperationQueueTransport } from "./queue.ts";

test("unreachable Redis fails publication and closes without queued producer commands", async () => {
	const transport = createOperationQueueTransport("redis://127.0.0.1:1");
	const started = Date.now();
	try {
		await assert.rejects(transport.publish({ version: 1, operationId: "unreachable" }));
		assert.ok(Date.now() - started < 5_000, "publication must fail promptly");
	} finally {
		await transport.close();
	}
	assert.ok(Date.now() - started < 5_000, "producer close must finish promptly");
});
