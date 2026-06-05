import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "discord.js";

test("createIpc returns a no-op shard context when client has no shard", async () => {
	const { createIpc } = await import("./ipc.ts");
	const fakeClient = {
		shard: null,
		guilds: { cache: { size: 7 } },
	} as unknown as Client;
	const ipc = createIpc(fakeClient);
	assert.equal(ipc.mode, "native");
	const values = await ipc.fetchValues(
		(c) => (c as unknown as { guilds: { cache: { size: number } } }).guilds.cache.size,
	);
	assert.deepEqual(values, [7]);
});
