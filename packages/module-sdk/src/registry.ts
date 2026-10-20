import { type ModuleManifestV1, validateModuleManifest } from "./manifest.ts";

export interface ModuleRegistryEntry {
	manifest: ModuleManifestV1;
}

const compareIds = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;

function parts(version: string): [bigint, bigint, bigint] {
	const [major, minor, patch] = version.replace(/^\^/, "").split("+", 1)[0]?.split(".") ?? [];
	return [BigInt(major ?? 0), BigInt(minor ?? 0), BigInt(patch ?? 0)];
}

function compatible(version: string, requirement: string): boolean {
	const actual = parts(version);
	const wanted = parts(requirement);
	if (!requirement.startsWith("^")) return actual.every((part, index) => part === wanted[index]);
	const firstChangeable = wanted[0] !== 0n ? 0 : wanted[1] !== 0n ? 1 : 2;
	if (actual[firstChangeable] !== wanted[firstChangeable]) return false;
	for (let index = 0; index < firstChangeable; index++)
		if (actual[index] !== wanted[index]) return false;
	for (let index = 0; index < actual.length; index++) {
		if ((actual[index] ?? 0n) > (wanted[index] ?? 0n)) return true;
		if ((actual[index] ?? 0n) < (wanted[index] ?? 0n)) return false;
	}
	return true;
}

export function orderModuleRegistry<T extends ModuleRegistryEntry>(entries: readonly T[]): T[] {
	const byId = new Map<string, T>();
	for (const entry of entries) {
		const { id } = validateModuleManifest(entry.manifest);
		if (byId.has(id)) throw new Error(`Duplicate module id: ${id}`);
		byId.set(id, entry);
	}
	const remaining = new Map<string, number>();
	const dependents = new Map<string, string[]>();
	for (const entry of entries) {
		const { id, dependencies } = entry.manifest;
		remaining.set(id, dependencies.length);
		for (const dependency of dependencies) {
			const target = byId.get(dependency.id);
			if (!target) throw new Error(`Module ${id} has missing dependency ${dependency.id}`);
			if (!compatible(target.manifest.version, dependency.version))
				throw new Error(
					`Module ${id} has incompatible dependency ${dependency.id}: ${dependency.version} requires, ${target.manifest.version} found`,
				);
			dependents.set(dependency.id, [...(dependents.get(dependency.id) ?? []), id]);
		}
	}
	const ready = [...byId.keys()].filter((id) => remaining.get(id) === 0).sort(compareIds);
	const ordered: T[] = [];
	while (ready.length) {
		const id = ready.shift();
		if (!id) break;
		const entry = byId.get(id);
		if (!entry) throw new Error(`Module ${id} disappeared from registry`);
		ordered.push(entry);
		for (const dependent of dependents.get(id) ?? []) {
			const count = (remaining.get(dependent) ?? 0) - 1;
			remaining.set(dependent, count);
			if (count === 0) ready.push(dependent);
		}
		ready.sort(compareIds);
	}
	if (ordered.length !== entries.length)
		throw new Error(
			`Module dependency cycle blocks: ${[...remaining]
				.filter(([, count]) => count > 0)
				.map(([id]) => id)
				.sort(compareIds)
				.join(", ")}`,
		);
	return ordered;
}
