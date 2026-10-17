import { type ModuleLifecycle, type ModuleManifest, validateModuleManifest } from "./manifest.ts";

interface NamedCommand {
	data: { name: string };
}

interface NamedEvent {
	name: string;
}

interface NamedComponent {
	prefix: string;
}

interface NamedJob {
	name: string;
}

export interface LegacyModule {
	name: string;
	commands?: readonly NamedCommand[];
	events?: readonly NamedEvent[];
	components?: readonly NamedComponent[];
	jobs?: readonly NamedJob[];
	lifecycle?: Partial<ModuleLifecycle>;
}

export interface AdaptedLegacyModule<T extends LegacyModule> {
	module: T;
	manifest: ModuleManifest;
	lifecycle: ModuleLifecycle;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

function lifecycle(hooks: Partial<ModuleLifecycle> = {}): ModuleLifecycle {
	let signal: AbortSignal | undefined;
	let stopped: Promise<void> | undefined;
	const stop = (): Promise<void> => {
		if (!stopped) stopped = Promise.resolve(hooks.stop?.());
		return stopped;
	};
	const abort = () => void stop();
	return {
		async start(nextSignal) {
			signal = nextSignal;
			nextSignal.addEventListener("abort", abort, { once: true });
			if (nextSignal.aborted) return stop();
			await hooks.start?.(nextSignal);
		},
		async drain() {
			await hooks.drain?.();
		},
		async stop() {
			signal?.removeEventListener("abort", abort);
			await stop();
		},
	};
}

function manifest(module: LegacyModule): ModuleManifest {
	const capabilities = [
		module.commands?.length ? "commands" : undefined,
		module.events?.length ? "events" : undefined,
		module.components?.length ? "components" : undefined,
		module.jobs?.length ? "jobs" : undefined,
	].filter((value): value is string => value !== undefined);
	return validateModuleManifest({
		id: module.name,
		version: "0.0.0",
		runtimePlacement: "gateway",
		dependencies: [],
		capabilities,
		intents: [],
		permissions: [],
		settingsOwnership: [],
		commands: unique((module.commands ?? []).map((command) => command.data.name)),
		routes: [],
		events: unique((module.events ?? []).map((event) => event.name)),
		jobs: unique((module.jobs ?? []).map((job) => job.name)),
		externalScopes: [],
		resourceBudgets: {},
		health: { readiness: "loaded", liveness: "gateway" },
	});
}

export function adaptLegacyModules<T extends LegacyModule>(
	modules: readonly T[],
): AdaptedLegacyModule<T>[] {
	const seen = new Set<string>();
	return modules.map((module) => {
		if (seen.has(module.name)) throw new Error(`Duplicate module id: ${module.name}`);
		seen.add(module.name);
		return { module, manifest: manifest(module), lifecycle: lifecycle(module.lifecycle) };
	});
}
