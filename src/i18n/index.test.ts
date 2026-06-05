import assert from "node:assert/strict";
import { test } from "node:test";

test("t resolves a key and interpolates vars", async () => {
	const { t } = await import("./index.ts");
	assert.equal(t("common:ping.pong", { ms: 42 }), "Pong! 42ms");
});

test("t returns the key when missing", async () => {
	const { t } = await import("./index.ts");
	assert.equal(t("common:does.not.exist"), "common:does.not.exist");
});

test("registerLocale merges module strings under a namespace", async () => {
	const { t, registerLocale } = await import("./index.ts");
	registerLocale("en", "demo", { hi: "Hello {name}" });
	assert.equal(t("demo:hi", { name: "Ada" }), "Hello Ada");
});
