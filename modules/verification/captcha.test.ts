import assert from "node:assert/strict";
import { test } from "node:test";
import { makeCaptcha } from "./captcha.ts";

test("makeCaptcha builds a solvable sum with one correct option", () => {
	for (let i = 0; i < 200; i++) {
		const cap = makeCaptcha();
		const [a, b] = cap.question.split(" + ").map(Number);
		const sum = (a as number) + (b as number);

		assert.equal(cap.options.length, 4, "four options");
		const correct = cap.options.filter((o) => o.correct);
		assert.equal(correct.length, 1, "exactly one correct option");
		assert.equal(Number(correct[0]?.label), sum, "correct label equals the sum");

		const labels = cap.options.map((o) => o.label);
		assert.equal(new Set(labels).size, 4, "all options are distinct");
		for (const o of cap.options) assert.ok(Number(o.label) > 0, "options are positive");
	}
});
