import { IntlMessageFormat } from "intl-messageformat";

/**
 * Translation quality checks for the CI gate. Two things matter: a translated
 * string must (1) compile as ICU MessageFormat, and (2) keep exactly the same
 * simple `{placeholder}` set as its English source (translators must not drop,
 * rename, or invent runtime variables). Plural/select correctness is covered by
 * the compile check; simple interpolation is the common-case bug we guard.
 */

/** Extract the simple `{name}` placeholders from a message (ignores ICU `{x, plural, ...}`). */
export function simpleArgs(message: string): Set<string> {
	const args = new Set<string>();
	for (const match of message.matchAll(/\{(\w+)\}/g)) {
		if (match[1]) args.add(match[1]);
	}
	return args;
}

function eqSets(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

export interface ValidationIssue {
	ok: boolean;
	errors: string[];
}

/** Validate one translated value against its English source. */
export function validateTranslation(english: string, translated: string): ValidationIssue {
	const errors: string[] = [];
	try {
		// Compiling with a representative locale catches malformed ICU / unbalanced braces.
		new IntlMessageFormat(translated, "en");
	} catch (err) {
		errors.push(`invalid ICU: ${(err as Error).message.split("\n")[0]}`);
	}
	const enArgs = simpleArgs(english);
	const trArgs = simpleArgs(translated);
	if (!eqSets(enArgs, trArgs)) {
		const missing = [...enArgs].filter((a) => !trArgs.has(a));
		const extra = [...trArgs].filter((a) => !enArgs.has(a));
		if (missing.length)
			errors.push(`missing placeholders: ${missing.map((m) => `{${m}}`).join(", ")}`);
		if (extra.length) errors.push(`unknown placeholders: ${extra.map((e) => `{${e}}`).join(", ")}`);
	}
	return { ok: errors.length === 0, errors };
}
