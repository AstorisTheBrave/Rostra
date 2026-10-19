import assert from "node:assert/strict";
import test from "node:test";
import { compareMeasurements, validateMeasurements } from "./phase01-measure.mjs";

const measurement = {
	schemaVersion: 1 as const,
	environment: {
		platform: "win32",
		architecture: "x64",
		release: "10.0.26300",
		nodeVersion: "v24.19.0",
		cpuModel: "AMD Ryzen 5 5500H",
		logicalCpus: 8,
		memoryBytes: 16_500_000_000,
	},
	workloads: {
		apiAuthorization: {
			runtime: "node v24.19.0; windows x64",
			iterations: 3,
			requestLatencyMs: [1, 2, 3],
			databaseQueryCount: [1, 1, 1],
			eventLoopDelayMs: [0.1, 0.2, 0.3],
			cacheColdLatencyMs: [2, 2, 2],
			cacheWarmLatencyMs: [1, 1, 1],
			queueLagMs: [4, 4, 4],
		},
	},
};

test("measurement workload requires runtime and positive iteration metadata", () => {
	const missingRuntime = structuredClone(measurement);
	Reflect.deleteProperty(missingRuntime.workloads.apiAuthorization, "runtime");
	assert.throws(() => validateMeasurements(missingRuntime), /runtime/);

	const missingIterations = structuredClone(measurement);
	Reflect.deleteProperty(missingIterations.workloads.apiAuthorization, "iterations");
	assert.throws(() => validateMeasurements(missingIterations), /iterations/);
});

test("measurement samples reject non-finite values", () => {
	const invalid = structuredClone(measurement);
	invalid.workloads.apiAuthorization.queueLagMs = [Number.POSITIVE_INFINITY, 1, 1];
	assert.throws(() => validateMeasurements(invalid), /finite/);
});

test("comparison rejects different workload metadata and summarizes identical inputs", () => {
	const incompatible = structuredClone(measurement);
	incompatible.workloads.apiAuthorization.runtime = "node v22.0.0; linux x64";
	assert.throws(() => compareMeasurements(measurement, incompatible), /incompatible/);

	const result = compareMeasurements(measurement, measurement);
	assert.deepEqual(result.workloads.apiAuthorization, {
		iterations: 3,
		runtime: "node v24.19.0; windows x64",
		before: {
			requestP95Ms: 3,
			databaseQueryCount: 1,
			eventLoopDelayP95Ms: 0.3,
			cacheColdMeanMs: 2,
			cacheWarmMeanMs: 1,
			queueLagP95Ms: 4,
		},
		after: {
			requestP95Ms: 3,
			databaseQueryCount: 1,
			eventLoopDelayP95Ms: 0.3,
			cacheColdMeanMs: 2,
			cacheWarmMeanMs: 1,
			queueLagP95Ms: 4,
		},
	});
});

test("comparison rejects different host environments", () => {
	const otherHost = structuredClone(measurement);
	otherHost.environment.nodeVersion = "v22.0.0";
	assert.throws(() => compareMeasurements(measurement, otherHost), /environment/);
});

test("hostile workload keys remain data and do not mutate the prototype", () => {
	const hostile = JSON.parse(JSON.stringify(measurement));
	Object.defineProperty(hostile.workloads, "__proto__", {
		value: structuredClone(measurement.workloads.apiAuthorization),
		enumerable: true,
	});
	const output = compareMeasurements(hostile, hostile);
	assert.equal(Object.getPrototypeOf(output.workloads), null);
	assert.equal(Object.hasOwn(output.workloads, "__proto__"), true);
	assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
