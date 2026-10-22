import { createServer, type Server } from "node:http";
import { verifyBearer } from "@rostra/auth";
import Redis from "ioredis";

type PollHealth = { lastSuccessAt: number; lastPollOk: boolean };

export function createWorkerHealthRedis(url: string): Redis {
	return new Redis(url, {
		maxRetriesPerRequest: 1,
		enableOfflineQueue: false,
		autoResendUnfulfilledCommands: false,
		connectTimeout: 1_000,
		commandTimeout: 1_000,
		socketTimeout: 1_000,
	});
}

export function eventLoopDelayP95Ms(percentile: (percentile: number) => number): number {
	const delay = percentile(95) / 1_000_000;
	return Number.isFinite(delay) ? delay : 0;
}

export interface WorkerHealthDeps {
	internalToken?: string;
	probeDatabase(): Promise<unknown>;
	probeRedis(): Promise<unknown>;
	closing(): boolean;
	metrics(): { outbox?: PollHealth; scheduler?: PollHealth; [key: string]: unknown };
	now?: () => number;
	probeTimeoutMs?: number;
}

export function createWorkerHealthServer(deps: WorkerHealthDeps): Server {
	const now = deps.now ?? Date.now;
	const timeoutMs = deps.probeTimeoutMs ?? 1_000;
	const probe = (run: () => Promise<unknown>) => {
		let pending: Promise<boolean> | undefined;
		return () => {
			if (pending) return pending;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const operation = Promise.resolve().then(run);
			pending = Promise.race([
				operation,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error("health_probe_timeout")), timeoutMs);
				}),
			])
				.then(
					() => true,
					() => false,
				)
				.finally(() => clearTimeout(timer));
			// Keep timed-out work coalesced until the underlying dependency settles.
			void operation.then(
				() => {
					pending = undefined;
				},
				() => {
					pending = undefined;
				},
			);
			return pending;
		};
	};
	const probeDatabase = probe(deps.probeDatabase);
	const probeRedis = probe(deps.probeRedis);
	return createServer(async (request, response) => {
		const send = (code: number, value: object) => {
			response.writeHead(code, { "content-type": "application/json" });
			response.end(JSON.stringify(value));
		};
		const path = request.url?.split("?", 1)[0];
		if (request.method !== "GET") return send(404, { error: "not_found" });
		if (path === "/health/live") return send(200, { status: "ok" });
		if (path === "/internal/diagnostics") {
			const token = request.headers.authorization;
			if (!verifyBearer(typeof token === "string" ? token : undefined, deps.internalToken))
				return send(401, { error: "unauthorized" });
			return send(200, { status: deps.closing() ? "stopping" : "running", ...deps.metrics() });
		}
		if (path === "/health/ready") {
			const metrics = deps.metrics();
			const recent = (poll: PollHealth | undefined) => {
				const age = now() - (poll?.lastSuccessAt ?? 0);
				return poll?.lastPollOk && poll.lastSuccessAt > 0 && age >= 0 && age <= 15_000;
			};
			const ready =
				!deps.closing() &&
				recent(metrics.outbox) &&
				recent(metrics.scheduler) &&
				(await Promise.all([probeDatabase(), probeRedis()])).every(Boolean);
			return send(ready ? 200 : 503, { status: ready ? "ready" : "not_ready" });
		}
		return send(404, { error: "not_found" });
	});
}
