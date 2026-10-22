import assert from "node:assert/strict";
import { test } from "node:test";
import { compileRule, firstMatchingRule, matchRule, validateRuleInput } from "./rules.ts";

const rule = (over: Partial<Parameters<typeof matchRule>[1]> = {}) => ({
	name: "r",
	enabled: true,
	trigger: "keyword",
	pattern: "spam",
	action: "delete",
	...over,
});

test("keyword matches whole words case-insensitively, not substrings", () => {
	assert.equal(matchRule("buy SPAM now", rule()), true);
	assert.equal(matchRule("this is spammy", rule()), false); // not a whole word
});

test("wildcard expands * to any run of characters", () => {
	const r = rule({ trigger: "wildcard", pattern: "disc*gg" });
	assert.equal(matchRule("join discord.gg/x", r), true);
	assert.equal(matchRule("discgg", r), true);
	assert.equal(matchRule("nope", r), false);
});

test("regex compiles and matches; invalid regex never throws", () => {
	assert.equal(matchRule("a1b2", rule({ trigger: "regex", pattern: "[0-9]+" })), true);
	assert.equal(matchRule("abc", rule({ trigger: "regex", pattern: "([" })), false); // bad regex -> no match
});

test("disabled rules and empty content never match", () => {
	assert.equal(matchRule("spam", rule({ enabled: false })), false);
	assert.equal(matchRule("", rule()), false);
});

test("firstMatchingRule returns the first hit in order", () => {
	const rules = [rule({ name: "a", pattern: "foo" }), rule({ name: "b", pattern: "spam" })];
	assert.equal(firstMatchingRule("this is spam", rules)?.name, "b");
	assert.equal(firstMatchingRule("clean text", rules), null);
});

test("validateRuleInput catches bad input", () => {
	assert.equal(validateRuleInput("keyword", "hi"), null);
	assert.equal(validateRuleInput("nonsense", "hi"), "badTrigger");
	assert.equal(validateRuleInput("keyword", "   "), "emptyPattern");
	assert.equal(validateRuleInput("regex", "([)"), "badPattern");
	assert.equal(validateRuleInput("keyword", "x".repeat(201)), "tooLong");
});

test("compileRule rejects overlong patterns", () => {
	assert.equal(compileRule("keyword", "x".repeat(201)), null);
});
