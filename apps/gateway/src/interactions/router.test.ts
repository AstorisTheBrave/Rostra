import assert from "node:assert/strict";
import { test } from "node:test";

test("parseCustomId splits prefix and args", async () => {
	const { parseCustomId } = await import("./router.ts");
	assert.deepEqual(parseCustomId("mod:ban:confirm:123"), {
		prefix: "mod",
		args: ["ban", "confirm", "123"],
	});
});

test("parseCustomId handles a bare prefix", async () => {
	const { parseCustomId } = await import("./router.ts");
	assert.deepEqual(parseCustomId("help"), { prefix: "help", args: [] });
});
