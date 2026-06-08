import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModules } from "@/client/loaders/modules.ts";
import { config } from "@/config.ts";
import { SUPPORTED_LOCALES } from "@/i18n/locales.ts";
import { validateTranslation } from "@/i18n/validate.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Generate machine-translation **drafts** for every missing key in every language
 * via a configurable chat-completions provider (`TRANSLATE_*` env). Drafts are
 * validated (ICU compiles, placeholders preserved) before being written, and the
 * keys are recorded in `locales/<code>/_drafts.json` so the review workflow
 * (Crowdin/Weblate) knows what still needs a human. Existing translations are
 * never overwritten. After review, `npm run i18n:push` takes them live.
 *
 * This is the "AI drafts + platform review" half: run it to fill all 16 langs,
 * then humans refine. It does not touch the running bot; the glossary keeps
 * brand/feature terms and ICU placeholders intact.
 */

const log = getLogger("i18n:draft");
const i18nDir = join(dirname(fileURLToPath(import.meta.url)), "..", "i18n");
const localesDir = join(i18nDir, "locales");

function readJson<T>(path: string, fallback: T): T {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return fallback;
	}
}

async function englishSource(): Promise<Map<string, Record<string, string>>> {
	const source = new Map<string, Record<string, string>>();
	source.set("common", readJson(join(localesDir, "en", "common.json"), {}));
	for (const module of await loadModules()) {
		if (module.i18n) source.set(module.name, module.i18n);
	}
	return source;
}

interface Glossary {
	doNotTranslate?: string[];
}

/** Ask the provider to translate a batch of key->English into one language as JSON. */
async function translateBatch(
	localeName: string,
	keep: string[],
	batch: Record<string, string>,
): Promise<Record<string, string>> {
	const { apiKey, baseUrl, model } = config.translate;
	if (!apiKey || !baseUrl || !model) {
		throw new Error("TRANSLATE_API_KEY, TRANSLATE_BASE_URL and TRANSLATE_MODEL are required");
	}
	const system = [
		`You are a professional translator localizing a Discord bot into ${localeName}.`,
		"Return ONLY a JSON object mapping each input key to its translation.",
		"Rules: keep every {placeholder} exactly as written; keep ICU MessageFormat syntax",
		"(plural/select keywords, #, and braces) intact; preserve Markdown (**bold**) and emoji;",
		`do not translate these terms, keep them verbatim: ${keep.join(", ") || "(none)"}.`,
		"Use natural, concise wording suitable for a chat UI.",
	].join(" ");
	const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify({
			model,
			temperature: 0.2,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: JSON.stringify(batch) },
			],
		}),
	});
	if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
	const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
	const content = data.choices?.[0]?.message?.content ?? "{}";
	return JSON.parse(content) as Record<string, string>;
}

async function main(): Promise<void> {
	const source = await englishSource();
	const glossary = readJson<Glossary>(join(localesDir, "_glossary.json"), {});
	const keep = glossary.doNotTranslate ?? [];

	for (const meta of Object.values(SUPPORTED_LOCALES)) {
		if (meta.code === "en") continue;
		const dir = join(localesDir, meta.code);
		mkdirSync(dir, { recursive: true });
		const draftedKeys = new Set(readJson<string[]>(join(dir, "_drafts.json"), []));

		for (const [namespace, englishStrings] of source) {
			const file = join(dir, `${namespace}.json`);
			const existing = readJson<Record<string, string>>(file, {});
			const missing = Object.fromEntries(
				Object.entries(englishStrings).filter(([key]) => existing[key] === undefined),
			);
			if (Object.keys(missing).length === 0) continue;

			let translated: Record<string, string>;
			try {
				translated = await translateBatch(meta.name, keep, missing);
			} catch (err) {
				log.error({ err, locale: meta.code, namespace }, "translate batch failed");
				continue;
			}

			let written = 0;
			for (const [key, english] of Object.entries(missing)) {
				const value = translated[key];
				if (typeof value !== "string") continue;
				if (!validateTranslation(english, value).ok) continue; // skip bad drafts
				existing[key] = value;
				draftedKeys.add(`${namespace}:${key}`);
				written++;
			}
			if (written > 0) {
				writeFileSync(file, `${JSON.stringify(existing, null, "\t")}\n`);
				log.info({ locale: meta.code, namespace, written }, "drafted");
			}
		}
		writeFileSync(
			join(dir, "_drafts.json"),
			`${JSON.stringify([...draftedKeys].sort(), null, "\t")}\n`,
		);
	}
	log.info(
		"i18n:draft complete - review the drafts, then run npm run i18n:bundle && npm run i18n:push",
	);
}

main().catch((err) => {
	log.error({ err }, "i18n:draft failed");
	process.exitCode = 1;
});
