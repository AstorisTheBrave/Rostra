import assert from "node:assert/strict";
import { test } from "node:test";

test("getLogger returns a child logger bound to scope", async () => {
	const { getLogger } = await import("./logger.ts");
	const log = getLogger("test-scope");
	assert.equal(typeof log.info, "function");
	assert.equal(typeof log.error, "function");
	// child loggers from the same root are reused per scope
	const log2 = getLogger("test-scope");
	assert.equal(log, log2);
});
