import assert from "node:assert/strict";
import { test } from "node:test";

test("getPrisma returns a cached singleton", async () => {
	const { getPrisma } = await import("./database.ts");
	const a = getPrisma();
	const b = getPrisma();
	assert.equal(a, b);
	assert.equal(typeof a.$connect, "function");
});
