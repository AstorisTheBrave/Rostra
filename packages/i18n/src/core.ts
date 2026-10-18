import { IntlMessageFormat } from "intl-messageformat";
import common from "./locales/en/common.json" with { type: "json" };
import { DEFAULT_LOCALE, normalizeLocale } from "./locales.ts";

export type Vars = Record<string, string | number>;
type Bundle = Record<string, Record<string, string>>;

const locales: Record<string, Bundle> = { en: { common } };
const formatterCache = new Map<string, IntlMessageFormat>();
const badMessages = new Set<string>();

export function registerLocale(
	locale: string,
	namespace: string,
	strings: Record<string, string>,
): void {
	const bundle = locales[locale] ?? {};
	bundle[namespace] = { ...(bundle[namespace] ?? {}), ...strings };
	locales[locale] = bundle;
}

function interpolate(template: string, vars?: Vars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_, key: string) =>
		key in vars ? String(vars[key]) : `{${key}}`,
	);
}

function format(message: string, locale: string, vars?: Vars): string {
	const cacheKey = `${locale}\0${message}`;
	try {
		let formatter = formatterCache.get(cacheKey);
		if (!formatter) {
			formatter = new IntlMessageFormat(message, locale);
			formatterCache.set(cacheKey, formatter);
		}
		return String(formatter.format(vars ?? {}));
	} catch {
		badMessages.add(cacheKey);
		return interpolate(message, vars);
	}
}

export function translate(key: string, vars?: Vars, locale = DEFAULT_LOCALE): string {
	const normalized = normalizeLocale(locale) ?? DEFAULT_LOCALE;
	const [namespace, ...rest] = key.split(":");
	const path = rest.join(":");
	const message =
		locales[normalized]?.[namespace ?? ""]?.[path] ?? locales.en?.[namespace ?? ""]?.[path];
	return message ? format(message, normalized, vars) : key;
}
