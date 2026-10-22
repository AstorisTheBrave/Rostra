import {
	type AdaptedLegacyModule,
	adaptLegacyModule,
	orderModuleRegistry,
} from "@rostra/module-sdk";
import { moduleRegistry } from "@/modules/registry.ts";
import type { BotModule } from "@/types/module.ts";

export async function loadModuleRegistry(): Promise<AdaptedLegacyModule<BotModule>[]> {
	const loaded: AdaptedLegacyModule<BotModule>[] = [];
	for (const entry of orderModuleRegistry(moduleRegistry)) {
		const imported = await entry.load();
		loaded.push(adaptLegacyModule(imported.default, entry.manifest));
	}
	return loaded;
}

export async function loadModules(): Promise<BotModule[]> {
	return (await loadModuleRegistry()).map((entry) => entry.module);
}
