import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLogger } from "@/services/logger.ts";
import type { BotModule } from "@/types/module.ts";

const log = getLogger("loader:modules");

const defaultModulesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "modules");

/** Discover `<dir>/<module>/index.(ts|js)` and import each default-exported BotModule. */
export async function loadModules(dir: string = defaultModulesDir): Promise<BotModule[]> {
	if (!existsSync(dir)) {
		log.warn({ dir }, "modules directory not found");
		return [];
	}
	const entries = await readdir(dir, { withFileTypes: true });
	const modules: BotModule[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const base = join(dir, entry.name, "index");
		const file = existsSync(`${base}.ts`)
			? `${base}.ts`
			: existsSync(`${base}.js`)
				? `${base}.js`
				: undefined;
		if (!file) continue;
		const imported: { default?: BotModule } = await import(pathToFileURL(file).href);
		const def = imported.default;
		if (def?.name) modules.push(def);
		else log.warn({ module: entry.name }, "module has no default BotModule export");
	}
	return modules;
}
