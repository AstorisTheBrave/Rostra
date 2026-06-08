/**
 * The set of languages Rostra can localize into. The architecture supports all
 * of these from day one; translation files are filled in waves. `discord` is the
 * Discord locale code used for native slash-command name/description localization
 * (null = Discord has no matching locale, so only runtime responses localize).
 */

export interface LocaleMeta {
	code: string; // our internal code (also the locales/<code>/ folder)
	name: string; // English name
	native: string; // endonym, for menus
	discord: string | null; // Discord API locale code, or null
	rtl: boolean;
	wave: 1 | 2; // translation rollout wave
}

export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES: Record<string, LocaleMeta> = {
	en: { code: "en", name: "English", native: "English", discord: "en-US", rtl: false, wave: 1 },
	fr: { code: "fr", name: "French", native: "Français", discord: "fr", rtl: false, wave: 1 },
	de: { code: "de", name: "German", native: "Deutsch", discord: "de", rtl: false, wave: 1 },
	es: { code: "es", name: "Spanish", native: "Español", discord: "es-ES", rtl: false, wave: 1 },
	"pt-BR": {
		code: "pt-BR",
		name: "Portuguese (Brazil)",
		native: "Português do Brasil",
		discord: "pt-BR",
		rtl: false,
		wave: 1,
	},
	ru: { code: "ru", name: "Russian", native: "Русский", discord: "ru", rtl: false, wave: 1 },
	"zh-CN": {
		code: "zh-CN",
		name: "Chinese (Simplified)",
		native: "简体中文",
		discord: "zh-CN",
		rtl: false,
		wave: 1,
	},
	it: { code: "it", name: "Italian", native: "Italiano", discord: "it", rtl: false, wave: 2 },
	nl: { code: "nl", name: "Dutch", native: "Nederlands", discord: "nl", rtl: false, wave: 2 },
	pl: { code: "pl", name: "Polish", native: "Polski", discord: "pl", rtl: false, wave: 2 },
	tr: { code: "tr", name: "Turkish", native: "Türkçe", discord: "tr", rtl: false, wave: 2 },
	uk: { code: "uk", name: "Ukrainian", native: "Українська", discord: "uk", rtl: false, wave: 2 },
	ja: { code: "ja", name: "Japanese", native: "日本語", discord: "ja", rtl: false, wave: 2 },
	ko: { code: "ko", name: "Korean", native: "한국어", discord: "ko", rtl: false, wave: 2 },
	"zh-TW": {
		code: "zh-TW",
		name: "Chinese (Traditional)",
		native: "繁體中文",
		discord: "zh-TW",
		rtl: false,
		wave: 2,
	},
	ar: { code: "ar", name: "Arabic", native: "العربية", discord: null, rtl: true, wave: 2 },
};

export const SUPPORTED_CODES = Object.keys(SUPPORTED_LOCALES);

export function isSupportedLocale(code: string): boolean {
	return code in SUPPORTED_LOCALES;
}

// Discord locale code -> our code, for resolving the interaction's client locale.
const DISCORD_TO_CODE: Record<string, string> = (() => {
	const map: Record<string, string> = {};
	for (const meta of Object.values(SUPPORTED_LOCALES)) {
		if (meta.discord) map[meta.discord] = meta.code;
	}
	// Common Discord variants that should collapse to one of ours.
	map["en-GB"] = "en";
	map["es-419"] = "es";
	return map;
})();

/**
 * Normalise any input (Discord interaction locale, a stored preference, a raw
 * "fr-CA") to a supported code, or null if we cannot map it. Tries exact match,
 * then the Discord map, then the language prefix ("pt-PT" -> "pt-BR" only via the
 * prefix table below; "fr-CA" -> "fr").
 */
export function normalizeLocale(input: string | null | undefined): string | null {
	if (!input) return null;
	if (isSupportedLocale(input)) return input;
	if (input in DISCORD_TO_CODE) return DISCORD_TO_CODE[input] ?? null;
	const prefix = input.split("-")[0]?.toLowerCase() ?? "";
	if (isSupportedLocale(prefix)) return prefix;
	// Prefix fallbacks for languages whose only variant is regional.
	const prefixFallback: Record<string, string> = { pt: "pt-BR", zh: "zh-CN" };
	return prefixFallback[prefix] ?? null;
}
