import assert from "node:assert/strict";
import { test } from "node:test";

test("getPrisma returns a cached singleton", async () => {
	const { getPrisma } = await import("@rostra/database");
	const a = getPrisma();
	const b = getPrisma();
	assert.equal(a, b);
	assert.equal(typeof a.$connect, "function");
});
