export type {
	DisposableEventRegistration,
	ModuleEventDescriptor,
	ModuleEventV1,
	VersionedModuleEventDescriptor,
} from "./events.ts";
export { validateModuleEvent } from "./events.ts";
export type { AdaptedLegacyModule, LegacyModule } from "./legacy-adapter.ts";
export { adaptLegacyModule, adaptLegacyModules } from "./legacy-adapter.ts";
export type { LifecycleFailure, ModuleLifecycle, SupervisedModule } from "./lifecycle.ts";
export { superviseModuleLifecycles } from "./lifecycle.ts";
export type {
	ModuleDependency,
	ModuleManifest,
	ModuleManifestV1,
	RuntimePlacement,
} from "./manifest.ts";
export { gatewayManifest, validateModuleManifest } from "./manifest.ts";
export type { ModuleRegistryEntry } from "./registry.ts";
export { orderModuleRegistry } from "./registry.ts";
