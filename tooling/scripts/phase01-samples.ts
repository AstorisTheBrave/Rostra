import { performance } from "node:perf_hooks";

interface AuthorizationSamples {
	requestLatencyMs: number[];
	databaseQueryCount: number[];
}

export async function recordAuthorizationSample(
	samples: AuthorizationSamples,
	authorizationRequest: () => Promise<number>,
	now: () => number = () => performance.now(),
): Promise<void> {
	const started = now();
	const databaseQueryCount = await authorizationRequest();
	samples.requestLatencyMs.push(now() - started);
	samples.databaseQueryCount.push(databaseQueryCount);
}
