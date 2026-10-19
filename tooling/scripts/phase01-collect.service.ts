import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { cacheGet, disconnectCache, invalidateConfig } from "@rostra/cache";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { BullMqOperationPublisher, PrismaOperationRepository } from "@rostra/operations";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { createApi } from "../../apps/api/src/server.ts";
import { evictTenantL1, getTenant } from "../../apps/gateway/src/services/tenant.ts";
import { WorkerRuntime } from "../../apps/workers/src/runtime.ts";
import type { Phase01Measurements } from "./phase01-measure.mjs";
import { validateMeasurements } from "./phase01-measure.mjs";
import { recordAuthorizationSample } from "./phase01-samples.ts";

const iterations = 20;
const workloadName = "api-auth-tenant-cache-durable-operation";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for measured operation");
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	}
}

function percentileSamples() {
	return {
		requestLatencyMs: [] as number[],
		databaseQueryCount: [] as number[],
		eventLoopDelayMs: [] as number[],
		cacheColdLatencyMs: [] as number[],
		cacheWarmLatencyMs: [] as number[],
		queueLagMs: [] as number[],
	};
}

export async function collectPhase01Measurements(outputFile: string): Promise<void> {
	assert(config.database.url, "DATABASE_URL is required for Phase 01 measurements");
	assert(config.redis.url, "REDIS_URL is required for Phase 01 measurements");
	const prisma = getPrisma();
	const guildId = `phase01-${randomUUID()}`;
	const operationIds: string[] = [];
	const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", {
		connection: redis as unknown as ConnectionOptions,
	});
	const publisher = new BullMqOperationPublisher(redis as unknown as ConnectionOptions);
	const repository = new PrismaOperationRepository();
	const runtime = new WorkerRuntime(new Redis(config.redis.url, { maxRetriesPerRequest: null }));
	let authorizationDatabaseCalls = 0;
	let closeApp: (() => Promise<void>) | undefined;
	const samples = percentileSamples();
	const cacheKey = `tenant:${guildId}`;
	try {
		await prisma.guild.create({ data: { id: guildId } });
		const app = await createApi({
			authenticate(authorization) {
				if (authorization === "Bearer host") return { kind: "host", subjectId: "phase01" };
				if (authorization === "Bearer guild")
					return {
						kind: "guild",
						subjectId: "phase01",
						guildId,
						permissions: ["guilds:read"],
					};
				return undefined;
			},
			async ready() {
				return true;
			},
			guildDirectory: {
				async get(id) {
					authorizationDatabaseCalls++;
					const guild = await prisma.guild.findUnique({
						where: { id },
						select: { id: true },
					});
					return guild ? { id: guild.id, configured: true } : undefined;
				},
			},
			repository,
			publisher,
			async recordVote() {},
		});
		closeApp = () => app.close();
		runtime.registerOperations(repository, new Map([["phase00.smoke", async () => {}]]));

		for (let index = 0; index < iterations; index++) {
			const delay = monitorEventLoopDelay({ resolution: 10 });
			delay.enable();
			try {
				authorizationDatabaseCalls = 0;
				await recordAuthorizationSample(samples, async () => {
					const response = await app.inject({
						method: "GET",
						url: `/internal/v1/guilds/${guildId}/summary`,
						headers: { authorization: "Bearer guild" },
					});
					assert.equal(response.statusCode, 200, response.body);
					return authorizationDatabaseCalls;
				});

				evictTenantL1(guildId);
				await invalidateConfig(cacheKey);
				const coldStarted = performance.now();
				await getTenant(guildId);
				samples.cacheColdLatencyMs.push(performance.now() - coldStarted);
				assert.ok(await cacheGet(cacheKey), "cold tenant load must populate Redis");
				evictTenantL1(guildId);
				const warmStarted = performance.now();
				await getTenant(guildId);
				samples.cacheWarmLatencyMs.push(performance.now() - warmStarted);

				const accepted = await app.inject({
					method: "POST",
					url: "/internal/v1/smoke",
					headers: {
						authorization: "Bearer host",
						"idempotency-key": `${guildId}-${index}`,
					},
					payload: { measurement: true },
				});
				assert.equal(accepted.statusCode, 202, accepted.body);
				const operationId = (accepted.json() as { id: string }).id;
				operationIds.push(operationId);
				try {
					await waitFor(async () => (await repository.get(operationId))?.status === "completed");
				} catch (error) {
					const status = (await repository.get(operationId))?.status;
					const queuedJob = await queue.getJob(`operation-${operationId}`);
					const state = await queuedJob?.getState();
					throw new Error(
						`worker did not complete the operation (status=${status}, queue=${state}, workers=${runtime.workerCount})`,
						{ cause: error },
					);
				}
				const job = await queue.getJob(`operation-${operationId}`);
				if (!job?.processedOn) throw new Error("worker must start the queued operation");
				samples.queueLagMs.push(Math.max(0, job.processedOn - job.timestamp));
				await new Promise((resolvePromise) => setTimeout(resolvePromise, 15));
				samples.eventLoopDelayMs.push(delay.max / 1_000_000);
			} finally {
				delay.disable();
			}
		}

		const measurements: Phase01Measurements = validateMeasurements({
			schemaVersion: 1,
			environment: {
				platform: platform(),
				architecture: arch(),
				release: release(),
				nodeVersion: process.version,
				cpuModel: cpus()[0]?.model ?? "unknown",
				logicalCpus: cpus().length,
				memoryBytes: totalmem(),
			},
			workloads: {
				[workloadName]: {
					runtime: `${process.version}; ${platform()}/${arch()}`,
					iterations,
					...samples,
				},
			},
		});
		mkdirSync(dirname(resolve(outputFile)), { recursive: true });
		writeFileSync(resolve(outputFile), `${JSON.stringify(measurements, null, 2)}\n`);
	} finally {
		await closeApp?.();
		await runtime.drain();
		await publisher.close();
		for (const operationId of operationIds) {
			const job = await queue.getJob(`operation-${operationId}`);
			await job?.remove();
		}
		await prisma.operationRecord.deleteMany({ where: { id: { in: operationIds } } });
		evictTenantL1(guildId);
		await invalidateConfig(cacheKey);
		await prisma.guildTenant.deleteMany({ where: { guildId } });
		await prisma.guild.deleteMany({ where: { id: guildId } });
		await queue.close();
		redis.disconnect();
		await disconnectCache();
		await disconnectPrisma();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const outputFile = process.argv[2];
	if (!outputFile) {
		console.error("usage: node --import tsx phase01-collect.service.ts <output.json>");
		process.exitCode = 1;
	} else {
		collectPhase01Measurements(outputFile).catch((error: unknown) => {
			console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
			process.exitCode = 1;
		});
	}
}
