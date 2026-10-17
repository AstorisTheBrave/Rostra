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

test("t handles ICU plurals", async () => {
	const { t, registerLocale } = await import("./index.ts");
	registerLocale("en", "plural", { warns: "{count, plural, one {# warning} other {# warnings}}" });
	assert.equal(t("plural:warns", { count: 1 }), "1 warning");
	assert.equal(t("plural:warns", { count: 3 }), "3 warnings");
});

test("t uses the explicit locale and falls back to English for missing keys", async () => {
	const { t, registerLocale } = await import("./index.ts");
	registerLocale("en", "loc", { hi: "Hello" });
	registerLocale("fr", "loc", { hi: "Bonjour" });
	assert.equal(t("loc:hi", undefined, "fr"), "Bonjour");
	assert.equal(t("loc:hi", undefined, "de"), "Hello"); // de missing -> English
});

test("runWithLocale sets the ambient locale for t", async () => {
	const { t, registerLocale, runWithLocale } = await import("./index.ts");
	registerLocale("en", "amb", { hi: "Hello" });
	registerLocale("fr", "amb", { hi: "Bonjour" });
	assert.equal(
		runWithLocale("fr", () => t("amb:hi")),
		"Bonjour",
	);
	assert.equal(t("amb:hi"), "Hello"); // outside the scope -> default
});

test("bundled translations register and resolve, with English fallback", async () => {
	const { t } = await import("./index.ts");
	const { registerBundledLocales } = await import("./bundled.ts");
	registerBundledLocales();
	assert.equal(
		t("common:error.guildOnly", undefined, "fr"),
		"Cette commande ne peut être utilisée que dans un serveur.",
	);
	assert.equal(
		t("common:error.guildOnly", undefined, "de"),
		"Dieser Befehl kann nur auf einem Server verwendet werden.",
	);
	// A key with no translation in the locale falls back to English.
	assert.equal(t("common:ping.pong", { ms: 5 }, "ru"), "Понг! 5мс");
});

test("normalizeLocale maps Discord and regional codes to supported ones", async () => {
	const { normalizeLocale } = await import("./locales.ts");
	assert.equal(normalizeLocale("en-US"), "en");
	assert.equal(normalizeLocale("fr-CA"), "fr");
	assert.equal(normalizeLocale("pt"), "pt-BR");
	assert.equal(normalizeLocale("zh-CN"), "zh-CN");
	assert.equal(normalizeLocale("xx"), null);
});

test("t falls back to plain interpolation for malformed ICU", async () => {
	const { t, registerLocale } = await import("./index.ts");
	registerLocale("en", "bad", { x: "Unclosed {brace and {name}" });
	// Does not throw; best-effort interpolation of the recognisable {name}.
	assert.equal(t("bad:x", { name: "Ada" }), "Unclosed {brace and Ada");
});
