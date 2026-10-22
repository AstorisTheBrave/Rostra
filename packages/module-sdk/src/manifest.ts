export type RuntimePlacement = "gateway" | "api" | "worker" | "web" | "realtime" | "activity";

export interface ModuleDependency {
	id: string;
	version: string;
}

export interface ModuleManifestV1 {
	schemaVersion: 1;
	id: string;
	version: string;
	runtimePlacement: RuntimePlacement;
	dependencies: readonly ModuleDependency[];
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
	settingsSchema?: { version: number; owner: string };
}

export type ModuleManifest = ModuleManifestV1;

const ID = /^[a-z][A-Za-z0-9]*$/;
const VERSION =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ARRAY_FIELDS = [
	"capabilities",
	"intents",
	"permissions",
	"settingsOwnership",
	"commands",
	"routes",
	"events",
	"jobs",
	"externalScopes",
] as const;
const PLACEMENTS: readonly string[] = ["gateway", "api", "worker", "web", "realtime", "activity"];

export function stableVersion(value: unknown): value is string {
	return typeof value === "string" && VERSION.test(value);
}

export function gatewayManifest(id: string): ModuleManifestV1 {
	return validateModuleManifest({
		schemaVersion: 1,
		id,
		version: "1.0.0",
		runtimePlacement: "gateway",
		dependencies: [],
		capabilities: [],
		intents: [],
		permissions: [],
		settingsOwnership: [],
		commands: [],
		routes: [],
		events: [],
		jobs: [],
		externalScopes: [],
		resourceBudgets: {},
		health: { readiness: "loaded", liveness: "gateway" },
	});
}

export function validateModuleManifest(value: unknown): ModuleManifestV1 {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Module manifest must be an object");
	const manifest = value as Record<string, unknown>;
	const id = String(manifest.id);
	if (typeof manifest.id !== "string" || !ID.test(manifest.id))
		throw new Error(`Invalid module id: ${id}`);
	if (manifest.schemaVersion !== 1) throw new Error(`Module ${id} has unknown schema version`);
	if (!stableVersion(manifest.version)) throw new Error(`Module ${id} has invalid version`);
	if (!PLACEMENTS.includes(manifest.runtimePlacement as string))
		throw new Error(`Module ${id} has invalid runtimePlacement`);
	for (const field of ARRAY_FIELDS) {
		const values = manifest[field];
		if (!Array.isArray(values) || values.some((item) => typeof item !== "string" || !item))
			throw new Error(`Module ${id} has invalid ${field}`);
		if (new Set(values).size !== values.length)
			throw new Error(`Module ${id} has duplicate ${field}`);
	}
	if (!Array.isArray(manifest.dependencies))
		throw new Error(`Module ${id} has invalid dependencies`);
	const dependencyIds = new Set<string>();
	for (const dependency of manifest.dependencies) {
		if (!dependency || typeof dependency !== "object" || Array.isArray(dependency))
			throw new Error(`Module ${id} has invalid dependency`);
		const dep = dependency as Record<string, unknown>;
		if (
			typeof dep.id !== "string" ||
			!ID.test(dep.id) ||
			typeof dep.version !== "string" ||
			!stableVersion(dep.version.replace(/^\^/, ""))
		)
			throw new Error(`Module ${id} has invalid dependency ${String(dep.id)}`);
		if (dependencyIds.has(dep.id))
			throw new Error(`Module ${id} has duplicate dependency ${dep.id}`);
		dependencyIds.add(dep.id);
	}
	const budgets = manifest.resourceBudgets;
	if (!budgets || typeof budgets !== "object" || Array.isArray(budgets))
		throw new Error(`Module ${id} has invalid resourceBudgets`);
	for (const [name, budget] of Object.entries(budgets)) {
		if (!name || typeof budget !== "number" || !Number.isFinite(budget) || budget < 0)
			throw new Error(`Module ${id} has invalid resourceBudgets.${name}`);
	}
	const health = manifest.health;
	if (
		!health ||
		typeof health !== "object" ||
		Array.isArray(health) ||
		Object.entries(health).some(([key, val]) => !key || typeof val !== "string" || !val)
	)
		throw new Error(`Module ${id} has invalid health`);
	if (manifest.settingsSchema !== undefined) {
		const schema = manifest.settingsSchema;
		if (!schema || typeof schema !== "object" || Array.isArray(schema))
			throw new Error(`Module ${id} has invalid settingsSchema`);
		const settings = schema as Record<string, unknown>;
		if (
			!Number.isSafeInteger(settings.version) ||
			(settings.version as number) < 1 ||
			settings.owner !== id
		)
			throw new Error(`Module ${id} has invalid settingsSchema`);
	}
	return value as ModuleManifestV1;
}
