export interface ModuleLifecycle {
	start(signal: AbortSignal): Promise<void>;
	drain(): Promise<void>;
	stop(): Promise<void>;
	dispose?(): Promise<void> | void;
}

export interface LifecycleFailure {
	id: string;
	phase: "start" | "drain" | "stop" | "dispose";
	error: unknown;
}

export interface SupervisedModule {
	id: string;
	enabled: boolean;
	lifecycle: Partial<ModuleLifecycle>;
}

export function superviseModuleLifecycles(modules: readonly SupervisedModule[]) {
	const controllers = new Map<string, AbortController>();
	let started = false;
	let stopped = false;
	let starting: Promise<LifecycleFailure[]> | undefined;
	let stopping: Promise<LifecycleFailure[]> | undefined;
	const run = async (phase: LifecycleFailure["phase"]): Promise<LifecycleFailure[]> => {
		const failures: LifecycleFailure[] = [];
		for (const { id, enabled, lifecycle } of modules) {
			if (!enabled || (phase !== "start" && !controllers.has(id))) continue;
			try {
				if (phase === "start") {
					if (stopped) break;
					const controller = new AbortController();
					controllers.set(id, controller);
					await lifecycle.start?.(controller.signal);
				} else await lifecycle[phase]?.();
			} catch (error) {
				failures.push({ id, phase, error });
			}
		}
		return failures;
	};
	return {
		async start(): Promise<LifecycleFailure[]> {
			if (started || stopped) return [];
			started = true;
			starting = run("start");
			return starting;
		},
		async drain(): Promise<LifecycleFailure[]> {
			if (!started || stopped) return [];
			for (const controller of controllers.values()) controller.abort();
			return run("drain");
		},
		async stop(): Promise<LifecycleFailure[]> {
			if (stopped) return stopping ?? [];
			stopped = true;
			if (!started) return [];
			for (const controller of controllers.values()) controller.abort();
			stopping = (async () => {
				await starting;
				return [...(await run("drain")), ...(await run("stop")), ...(await run("dispose"))];
			})();
			try {
				return await stopping;
			} finally {
				stopping = undefined;
			}
		},
	};
}
