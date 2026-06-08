import { registerLocale } from "./index.ts";
import deCommon from "./locales/de/common.json" with { type: "json" };
import esCommon from "./locales/es/common.json" with { type: "json" };
import frCommon from "./locales/fr/common.json" with { type: "json" };
import ptBrCommon from "./locales/pt-BR/common.json" with { type: "json" };
import ruCommon from "./locales/ru/common.json" with { type: "json" };
import zhCnCommon from "./locales/zh-CN/common.json" with { type: "json" };

/**
 * Statically import and register the translated locale files so they are bundled
 * by the build (no runtime fs reads). As the translated corpus grows past the
 * shared `common` strings, this becomes a generated manifest or a build-time copy
 * step + runtime loader; the registration API (`registerLocale`) stays the same.
 * Anything not translated falls back to English automatically.
 */
const BUNDLES: Array<[locale: string, namespace: string, strings: Record<string, string>]> = [
	["fr", "common", frCommon],
	["de", "common", deCommon],
	["es", "common", esCommon],
	["pt-BR", "common", ptBrCommon],
	["ru", "common", ruCommon],
	["zh-CN", "common", zhCnCommon],
];

let registered = false;

/** Register every bundled translation file. Idempotent - safe to call per boot. */
export function registerBundledLocales(): void {
	if (registered) return;
	for (const [locale, namespace, strings] of BUNDLES) registerLocale(locale, namespace, strings);
	registered = true;
}
