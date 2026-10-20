import type { ModuleLifecycle } from "./lifecycle.ts";
import { gatewayManifest, type ModuleManifest, validateModuleManifest } from "./manifest.ts";

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
	let stopped: Promise<void> | undefined;
	const stop = (): Promise<void> => {
		if (!stopped) stopped = Promise.resolve().then(() => hooks.stop?.());
		return stopped;
	};
	return {
		async start(nextSignal) {
			if (nextSignal.aborted) return;
			await hooks.start?.(nextSignal);
		},
		async drain() {
			await hooks.drain?.();
		},
		async stop() {
			await stop();
		},
		async dispose() {
			await hooks.dispose?.();
		},
	};
}

export function adaptLegacyModule<T extends LegacyModule>(
	module: T,
	manifest: ModuleManifest = gatewayManifest(module.name),
): AdaptedLegacyModule<T> {
	if (manifest.id !== module.name)
		throw new Error(`Module ${manifest.id} has mismatched runtime ${module.name}`);
	const capabilities = [
		module.commands?.length ? "commands" : undefined,
		module.events?.length ? "events" : undefined,
		module.components?.length ? "components" : undefined,
		module.jobs?.length ? "jobs" : undefined,
	].filter((value): value is string => value !== undefined);
	const validated = validateModuleManifest({
		...manifest,
		capabilities,
		commands: unique((module.commands ?? []).map((command) => command.data.name)),
		events: unique((module.events ?? []).map((event) => event.name)),
		jobs: unique((module.jobs ?? []).map((job) => job.name)),
	});
	return { module, manifest: validated, lifecycle: lifecycle(module.lifecycle) };
}

export function adaptLegacyModules<T extends LegacyModule>(
	modules: readonly T[],
): AdaptedLegacyModule<T>[] {
	const seen = new Set<string>();
	return modules.map((module) => {
		if (seen.has(module.name)) throw new Error(`Duplicate module id: ${module.name}`);
		seen.add(module.name);
		return adaptLegacyModule(module);
	});
}
