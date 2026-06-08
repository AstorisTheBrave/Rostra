import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModules } from "@/client/loaders/modules.ts";
import { validateTranslation } from "@/i18n/validate.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * CI quality gate for translations: every translated string must compile as ICU
 * and keep the same `{placeholder}` set as English. Exits non-zero on any issue.
 * Missing keys are NOT errors (English fallback covers them) - that is what
 * `i18n:coverage` is for.
 */

const log = getLogger("i18n:validate");
const localesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "i18n", "locales");

function readJson(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
	} catch {
		return {};
	}
}

async function englishSource(): Promise<Map<string, Record<string, string>>> {
	const source = new Map<string, Record<string, string>>();
	source.set("common", readJson(join(localesDir, "en", "common.json")));
	for (const module of await loadModules()) {
		if (module.i18n) source.set(module.name, module.i18n);
	}
	return source;
}

const source = await englishSource();
let problems = 0;

for (const locale of readdirSync(localesDir, { withFileTypes: true })) {
	if (!locale.isDirectory() || locale.name === "en") continue;
	const dir = join(localesDir, locale.name);
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".json") || file.startsWith("_")) continue;
		const namespace = file.replace(/\.json$/, "");
		const english = source.get(namespace) ?? {};
		const translated = readJson(join(dir, file));
		for (const [key, value] of Object.entries(translated)) {
			const en = english[key];
			if (en === undefined) continue; // orphan key (English source removed it) - not fatal
			const result = validateTranslation(en, value);
			if (!result.ok) {
				problems++;
				console.error(`✖ ${locale.name}/${namespace}:${key} - ${result.errors.join("; ")}`);
			}
		}
	}
}

if (problems > 0) {
	log.error({ problems }, "translation validation failed");
	process.exitCode = 1;
} else {
	console.log("✓ all translations valid (ICU compiles, placeholders match English)");
}
