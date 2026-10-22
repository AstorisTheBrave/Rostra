import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sampleFields = [
	"requestLatencyMs",
	"databaseQueryCount",
	"eventLoopDelayMs",
	"cacheColdLatencyMs",
	"cacheWarmLatencyMs",
	"queueLagMs",
];
const environmentFields = [
	"platform",
	"architecture",
	"release",
	"nodeVersion",
	"cpuModel",
	"logicalCpus",
	"memoryBytes",
];

function assert(condition, message) {
	if (!condition) throw new TypeError(message);
}

export function validateMeasurements(value) {
	assert(typeof value === "object" && value !== null, "measurement document must be an object");
	assert(value.schemaVersion === 1, "unsupported measurement schemaVersion");
	assert(
		typeof value.environment === "object" && value.environment !== null,
		"measurement environment is required",
	);
	for (const field of environmentFields.filter(
		(field) => field !== "logicalCpus" && field !== "memoryBytes",
	)) {
		const item = value.environment[field];
		assert(typeof item === "string" && item.trim(), `${field}: environment metadata is required`);
	}
	for (const field of ["logicalCpus", "memoryBytes"]) {
		assert(
			Number.isSafeInteger(value.environment[field]) && value.environment[field] > 0,
			`${field}: environment metadata must be a positive integer`,
		);
	}
	assert(
		typeof value.workloads === "object" && value.workloads !== null,
		"measurement workloads are required",
	);
	const names = Object.keys(value.workloads).sort();
	assert(names.length > 0, "at least one workload is required");
	for (const name of names) {
		const workload = value.workloads[name];
		assert(typeof name === "string" && name.length > 0, "workload identity is required");
		assert(
			typeof workload?.runtime === "string" && workload.runtime.trim(),
			`${name}: runtime is required`,
		);
		assert(
			Number.isSafeInteger(workload.iterations) && workload.iterations > 0,
			`${name}: iterations must be a positive integer`,
		);
		for (const field of sampleFields) {
			const samples = workload[field];
			assert(
				Array.isArray(samples) && samples.length === workload.iterations,
				`${name}: ${field} must contain one sample per iteration`,
			);
			assert(
				samples.every(
					(sample) => typeof sample === "number" && Number.isFinite(sample) && sample >= 0,
				),
				`${name}: ${field} samples must be finite non-negative numbers`,
			);
		}
		if (workload.providerRequestCount !== undefined) {
			assert(
				Array.isArray(workload.providerRequestCount) &&
					workload.providerRequestCount.length === workload.iterations &&
					workload.providerRequestCount.every(
						(sample) => Number.isSafeInteger(sample) && sample >= 0,
					),
				`${name}: providerRequestCount must contain one non-negative integer per iteration`,
			);
		}
	}
	return value;
}

function percentile(samples, percentileValue) {
	return [...samples].sort((left, right) => left - right)[
		Math.ceil(percentileValue * samples.length) - 1
	];
}

function mean(samples) {
	return samples.reduce((total, sample) => total + sample, 0) / samples.length;
}

function summarize(workload) {
	return {
		requestP95Ms: percentile(workload.requestLatencyMs, 0.95),
		databaseQueryCount: mean(workload.databaseQueryCount),
		eventLoopDelayP95Ms: percentile(workload.eventLoopDelayMs, 0.95),
		cacheColdMeanMs: mean(workload.cacheColdLatencyMs),
		cacheWarmMeanMs: mean(workload.cacheWarmLatencyMs),
		queueLagP95Ms: percentile(workload.queueLagMs, 0.95),
		...(workload.providerRequestCount === undefined
			? {}
			: { providerRequestsPerPrompt: mean(workload.providerRequestCount) }),
	};
}

export function compareMeasurements(beforeInput, afterInput) {
	const before = validateMeasurements(beforeInput);
	const after = validateMeasurements(afterInput);
	assert(
		JSON.stringify(environmentFields.map((field) => before.environment[field])) ===
			JSON.stringify(environmentFields.map((field) => after.environment[field])),
		"incompatible host environment metadata",
	);
	const beforeNames = Object.keys(before.workloads).sort();
	const afterNames = Object.keys(after.workloads).sort();
	assert(
		JSON.stringify(beforeNames) === JSON.stringify(afterNames),
		"incompatible workload identities",
	);
	const workloads = Object.create(null);
	for (const name of beforeNames) {
		const prior = before.workloads[name];
		const next = after.workloads[name];
		assert(
			prior.runtime === next.runtime && prior.iterations === next.iterations,
			`${name}: incompatible runtime or iteration metadata`,
		);
		assert(
			(prior.providerRequestCount === undefined) === (next.providerRequestCount === undefined),
			`${name}: incompatible provider request samples`,
		);
		workloads[name] = {
			iterations: prior.iterations,
			runtime: prior.runtime,
			before: summarize(prior),
			after: summarize(next),
		};
	}
	return { schemaVersion: 1, environment: before.environment, workloads };
}

function readJson(path) {
	return JSON.parse(readFileSync(isAbsolute(path) ? path : resolve(path), "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		const args = process.argv.slice(2);
		if (args[0] === "validate") {
			const [inputPath, outputPath] = args.slice(1);
			assert(
				inputPath,
				"usage: node phase01-measure.mjs validate <measurements.json> [normalized.json]",
			);
			const result = `${JSON.stringify(validateMeasurements(readJson(inputPath)), null, 2)}\n`;
			if (outputPath) writeFileSync(resolve(outputPath), result);
			else process.stdout.write(result);
		} else {
			const [beforePath, afterPath, outputPath] = args;
			assert(
				beforePath && afterPath,
				"usage: node phase01-measure.mjs <before.json> <after.json> [output.json]",
			);
			const result = `${JSON.stringify(compareMeasurements(readJson(beforePath), readJson(afterPath)), null, 2)}\n`;
			if (outputPath) writeFileSync(resolve(outputPath), result);
			else process.stdout.write(result);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
