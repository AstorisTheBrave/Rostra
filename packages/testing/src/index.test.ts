import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("temporary directories are unique and cleaned through the test lifecycle", async () => {
	const { temporaryDirectory } = await import("@rostra/testing");
	const cleanup: Array<() => void> = [];
	const context = {
		after: (fn: () => void) => {
			cleanup.push(fn);
		},
	};
	const first = temporaryDirectory(context);
	const second = temporaryDirectory(context);
	assert.notEqual(first, second);
	assert.ok(existsSync(first));
	for (const fn of cleanup) fn();
	assert.ok(!existsSync(first));
	assert.ok(!existsSync(second));
});
