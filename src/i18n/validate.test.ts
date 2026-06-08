import assert from "node:assert/strict";
import { test } from "node:test";
import { simpleArgs, validateTranslation } from "./validate.ts";

test("simpleArgs extracts {name} placeholders but not ICU plural args", () => {
	assert.deepEqual([...simpleArgs("Hi {user}, you have {count} pts")], ["user", "count"]);
	assert.deepEqual([...simpleArgs("{count, plural, one {# x} other {# y}}")], []);
	assert.deepEqual([...simpleArgs("no placeholders")], []);
});

test("validateTranslation passes when placeholders match and ICU compiles", () => {
	assert.deepEqual(validateTranslation("Hello {name}!", "Bonjour {name} !"), {
		ok: true,
		errors: [],
	});
});

test("validateTranslation flags a dropped placeholder", () => {
	const r = validateTranslation("Banned {user} for {reason}", "Banni {user}");
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes("missing placeholders") && e.includes("{reason}")));
});

test("validateTranslation flags an invented placeholder", () => {
	const r = validateTranslation("Hello {name}", "Hola {nombre}");
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.includes("unknown placeholders") && e.includes("{nombre}")));
});

test("validateTranslation flags malformed ICU", () => {
	const r = validateTranslation("ok", "broken {count, plural, one {#}");
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.startsWith("invalid ICU")));
});
