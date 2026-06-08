import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModules } from "@/client/loaders/modules.ts";
import { SUPPORTED_LOCALES } from "@/i18n/locales.ts";

/**
 * Report how complete each language is against the English source (module `i18n`
 * bundles + `common`). Prints per-locale coverage and lists missing namespaces.
 * Translation content, not behaviour, so this never fails CI - it is a guide for
 * the translation waves (Crowdin / AI drafts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, "..", "i18n", "locales");

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
	// common.json is the shared namespace.
	source.set("common", readJson(join(localesDir, "en", "common.json")));
	for (const module of await loadModules()) {
		if (module.i18n) source.set(module.name, module.i18n);
	}
	return source;
}

const source = await englishSource();
const totalKeys = [...source.values()].reduce((n, b) => n + Object.keys(b).length, 0);
console.log(`English source: ${source.size} namespaces, ${totalKeys} keys\n`);

for (const meta of Object.values(SUPPORTED_LOCALES)) {
	if (meta.code === "en") continue;
	let translated = 0;
	const missingNamespaces: string[] = [];
	for (const [namespace, keys] of source) {
		const file = readJson(join(localesDir, meta.code, `${namespace}.json`));
		const have = Object.keys(keys).filter((k) => file[k] !== undefined).length;
		translated += have;
		if (have < Object.keys(keys).length) missingNamespaces.push(namespace);
	}
	const pct = totalKeys ? Math.round((translated / totalKeys) * 100) : 0;
	const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "░");
	console.log(`${meta.code.padEnd(6)} ${bar} ${pct}%  (${translated}/${totalKeys})`);
	if (missingNamespaces.length && pct < 100) {
		console.log(
			`        missing: ${missingNamespaces.slice(0, 12).join(", ")}${missingNamespaces.length > 12 ? " …" : ""}`,
		);
	}
}
