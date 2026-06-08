import assert from "node:assert/strict";
import { test } from "node:test";
import { groupRows } from "./live.ts";

test("groupRows buckets rows by locale and namespace", () => {
	const grouped = groupRows([
		{ locale: "fr", namespace: "core", key: "a", value: "A" },
		{ locale: "fr", namespace: "core", key: "b", value: "B" },
		{ locale: "fr", namespace: "common", key: "a", value: "C" },
		{ locale: "de", namespace: "core", key: "a", value: "D" },
	]);
	assert.equal(grouped.length, 3);
	const frCore = grouped.find((g) => g.locale === "fr" && g.namespace === "core");
	assert.deepEqual(frCore?.strings, { a: "A", b: "B" });
	const frCommon = grouped.find((g) => g.locale === "fr" && g.namespace === "common");
	assert.deepEqual(frCommon?.strings, { a: "C" });
	const deCore = grouped.find((g) => g.locale === "de" && g.namespace === "core");
	assert.deepEqual(deCore?.strings, { a: "D" });
});

test("groupRows is empty for no rows", () => {
	assert.equal(groupRows([]).length, 0);
});
