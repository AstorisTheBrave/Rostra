interface PackageBoundary {
	directory: string;
	exports: Record<string, string>;
	dependencies?: Record<string, string>;
}

export function sourceViolations(
	path: string,
	source: string,
	packages: ReadonlyMap<string, PackageBoundary>,
): string[];
export function checkPackages(): string[];
