import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { disconnectCache } from "@rostra/cache";
import { disconnectPrisma } from "@rostra/database";
import { pushLocaleBundle } from "@rostra/i18n/live";
import { getLogger } from "@rostra/logger";

/**
 * Promote the file translations under `packages/i18n/src/locales/<code>/*.json` into the
 * live `LocaleString` store and fan out a reload to every running shard. This is
 * how a new/updated language goes live with **no restart**: edit files, run
 * `npm run i18n:push`. The files remain the build-time baseline; the DB rows are
 * the hot overlay. English (`en`) and `_`-prefixed files are skipped.
 */

const log = getLogger("i18n:push");
const localesDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"packages",
	"i18n",
	"src",
	"locales",
);

async function main(): Promise<void> {
	let pushed = 0;
	for (const locale of readdirSync(localesDir, { withFileTypes: true })) {
		if (!locale.isDirectory() || locale.name === "en") continue;
		const dir = join(localesDir, locale.name);
		for (const file of readdirSync(dir)) {
			if (!file.endsWith(".json") || file.startsWith("_")) continue;
			const namespace = file.replace(/\.json$/, "");
			const path = join(dir, file);
			if (!existsSync(path)) continue;
			const strings = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
			const n = await pushLocaleBundle(locale.name, namespace, strings);
			pushed += n;
			log.info({ locale: locale.name, namespace, keys: n }, "pushed");
		}
	}
	log.info({ pushed }, "i18n:push complete - live shards reloaded with no restart");
}

main()
	.catch((err) => {
		log.error({ err }, "i18n:push failed");
		process.exitCode = 1;
	})
	.finally(async () => {
		await disconnectCache().catch(() => {});
		await disconnectPrisma().catch(() => {});
	});
