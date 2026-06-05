import common from "./locales/en/common.json" with { type: "json" };

type Vars = Record<string, string | number>;
type Bundle = Record<string, Record<string, string>>; // namespace -> key -> value

const locales: Record<string, Bundle> = { en: { common } };

/** Register a module's strings under a namespace for a locale. */
export function registerLocale(
	locale: string,
	namespace: string,
	strings: Record<string, string>,
): void {
	(locales[locale] ??= {})[namespace] = {
		...(locales[locale]?.[namespace] ?? {}),
		...strings,
	};
}

function interpolate(template: string, vars?: Vars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Translate `namespace:key` with optional vars. Returns the key if missing. */
export function t(key: string, vars?: Vars, locale = "en"): string {
	const [ns, ...rest] = key.split(":");
	const path = rest.join(":");
	const value = locales[locale]?.[ns ?? ""]?.[path] ?? locales.en?.[ns ?? ""]?.[path];
	return value ? interpolate(value, vars) : key;
}
