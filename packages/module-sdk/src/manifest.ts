export type RuntimePlacement = "gateway" | "api" | "worker" | "web" | "realtime" | "activity";

export interface ModuleManifest {
	id: string;
	version: string;
	runtimePlacement: RuntimePlacement;
	dependencies: readonly string[];
	capabilities: readonly string[];
	intents: readonly string[];
	permissions: readonly string[];
	settingsOwnership: readonly string[];
	commands: readonly string[];
	routes: readonly string[];
	events: readonly string[];
	jobs: readonly string[];
	externalScopes: readonly string[];
	resourceBudgets: Readonly<Record<string, number>>;
	health: Readonly<Record<string, string>>;
}

export interface ModuleLifecycle {
	start(signal: AbortSignal): Promise<void>;
	drain(): Promise<void>;
	stop(): Promise<void>;
}

const ID = /^[a-z][A-Za-z0-9]*$/;

export function validateModuleManifest(manifest: ModuleManifest): ModuleManifest {
	if (!ID.test(manifest.id)) throw new Error(`Invalid module id: ${manifest.id}`);
	if (!manifest.version) throw new Error(`Module ${manifest.id} has no version`);
	for (const [field, values] of Object.entries(manifest)) {
		if (!Array.isArray(values)) continue;
		if (new Set(values).size !== values.length)
			throw new Error(`Module ${manifest.id} has duplicate ${field}`);
	}
	return manifest;
}
