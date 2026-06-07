import assert from "node:assert/strict";
import { test } from "node:test";
import { resultBar } from "./service.ts";

test("resultBar shows an empty bar when there are no votes", () => {
	assert.equal(resultBar(0, 0, 10), `${"░".repeat(10)} 0 (0%)`);
});

test("resultBar fills proportionally and shows the percentage", () => {
	assert.equal(resultBar(5, 10, 10), `${"█".repeat(5)}${"░".repeat(5)} 5 (50%)`);
	assert.equal(resultBar(10, 10, 10), `${"█".repeat(10)} 10 (100%)`);
});

test("resultBar rounds the fill and percentage", () => {
	// 1/3 of a size-12 bar -> 4 filled, 33%
	assert.equal(resultBar(1, 3, 12), `${"█".repeat(4)}${"░".repeat(8)} 1 (33%)`);
});
