export interface Phase01Environment {
	platform: string;
	architecture: string;
	release: string;
	nodeVersion: string;
	cpuModel: string;
	logicalCpus: number;
	memoryBytes: number;
}

export interface Phase01Workload {
	runtime: string;
	iterations: number;
	requestLatencyMs: number[];
	databaseQueryCount: number[];
	eventLoopDelayMs: number[];
	cacheColdLatencyMs: number[];
	cacheWarmLatencyMs: number[];
	queueLagMs: number[];
}

export interface Phase01Measurements {
	schemaVersion: 1;
	environment: Phase01Environment;
	workloads: Record<string, Phase01Workload>;
}

export function validateMeasurements(value: unknown): Phase01Measurements;

export function compareMeasurements(
	before: unknown,
	after: unknown,
): {
	schemaVersion: 1;
	environment: Phase01Environment;
	workloads: Record<
		string,
		{
			iterations: number;
			runtime: string;
			before: Record<string, number>;
			after: Record<string, number>;
		}
	>;
};
