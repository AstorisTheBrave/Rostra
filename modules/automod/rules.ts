/**
 * Custom automod rules: a content trigger plus a per-rule action. This is the
 * configurable layer on top of the built-in filters - a small YAGPDB-style
 * trigger/effect engine (conditions are covered by the global exempt list).
 */

export type RuleTrigger = "keyword" | "wildcard" | "regex";
export const RULE_TRIGGERS: RuleTrigger[] = ["keyword", "wildcard", "regex"];
export const RULE_ACTIONS = ["delete", "warn", "timeout"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const MAX_PATTERN_LENGTH = 200;

export interface RuleLike {
	name: string;
	enabled: boolean;
	trigger: string;
	pattern: string;
	action: string;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegex(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate and compile a rule pattern to a RegExp. Returns null when the pattern
 * is empty, too long, or (for `regex`) does not compile - callers treat null as
 * "invalid rule" and skip it. All matching is case-insensitive.
 */
export function compileRule(trigger: string, pattern: string): RegExp | null {
	const p = pattern.trim();
	if (!p || p.length > MAX_PATTERN_LENGTH) return null;
	try {
		if (trigger === "regex") return new RegExp(p, "i");
		if (trigger === "wildcard") {
			// `*` matches any run of characters; everything else is literal.
			const body = p.split("*").map(escapeRegex).join(".*");
			return new RegExp(body, "i");
		}
		// keyword: whole-word, case-insensitive substring on word boundaries.
		return new RegExp(`\\b${escapeRegex(p)}\\b`, "i");
	} catch {
		return null;
	}
}

/** Whether a single rule matches the content. */
export function matchRule(content: string, rule: RuleLike): boolean {
	if (!rule.enabled || !content) return false;
	const re = compileRule(rule.trigger, rule.pattern);
	return re ? re.test(content) : false;
}

/** The first enabled rule that matches, or null. */
export function firstMatchingRule<T extends RuleLike>(content: string, rules: T[]): T | null {
	for (const rule of rules) {
		if (matchRule(content, rule)) return rule;
	}
	return null;
}

/** Validate user input before persisting a rule. Returns an error key or null when ok. */
export function validateRuleInput(trigger: string, pattern: string): string | null {
	if (!RULE_TRIGGERS.includes(trigger as RuleTrigger)) return "badTrigger";
	if (!pattern.trim()) return "emptyPattern";
	if (pattern.length > MAX_PATTERN_LENGTH) return "tooLong";
	if (compileRule(trigger, pattern) === null) return "badPattern";
	return null;
}
