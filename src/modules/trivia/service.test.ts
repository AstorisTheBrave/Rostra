import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOptions } from "./service.ts";

test("buildOptions includes all answers and points correctIndex at the correct one", () => {
	const { options, correctIndex } = buildOptions("Paris", ["London", "Rome", "Berlin"]);
	assert.equal(options.length, 4);
	assert.equal(options[correctIndex], "Paris");
	for (const a of ["Paris", "London", "Rome", "Berlin"]) assert.ok(options.includes(a));
});

test("buildOptions handles a single incorrect answer", () => {
	const { options, correctIndex } = buildOptions("Yes", ["No"]);
	assert.equal(options.length, 2);
	assert.equal(options[correctIndex], "Yes");
});
