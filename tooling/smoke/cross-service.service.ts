import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { issuePrincipalToken, verifyBearer, verifyPrincipalToken } from "@rostra/auth";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { type OperationHandler, PrismaOperationRepository } from "@rostra/operations";
import { createHttpGuildClient } from "@rostra/web-client";
import { type ConnectionOptions, Queue } from "bullmq";
import Redis from "ioredis";
import { createOperationQueueTransport } from "../../apps/api/src/queue.ts";
import { createApi } from "../../apps/api/src/server.ts";
import { WorkerRuntime } from "../../apps/workers/src/runtime.ts";

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for smoke operation");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

test("gateway seam, API, worker, Redis, PostgreSQL and typed web read share one correlation id", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for cross-service smoke");
	const prisma = getPrisma();
	const repository = new PrismaOperationRepository();
	const correlationId = randomUUID();
	const guildId = `smoke-${correlationId}`;
	const idempotencyKey = `smoke-${correlationId}`;
	const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	const queue = new Queue("operations", { connection: redis as unknown as ConnectionOptions });
	const transport = createOperationQueueTransport(config.redis.url);
	const worker = new WorkerRuntime(new Redis(config.redis.url, { maxRetriesPerRequest: null }));
	const effectCorrelationIds: unknown[] = [];
	const handlers = new Map<string, OperationHandler>([
		[
			"phase00.smoke",
			async (operation) => {
				const payload = operation.payload;
				const effectCorrelationId =
					typeof payload === "object" && payload !== null && "correlationId" in payload
						? payload.correlationId
						: undefined;
				effectCorrelationIds.push(effectCorrelationId);
				await repository.recordEffect(operation.id, { correlationId: effectCorrelationId });
			},
		],
	]);
	worker.registerOperations(repository, handlers);
	const operationIds: string[] = [];
	let app: Awaited<ReturnType<typeof createApi>> | undefined;
	let serverUrl = "";
	try {
		await prisma.guild.create({ data: { id: guildId } });
		app = await createApi({
			authenticate(authorization) {
				if (verifyBearer(authorization, config.api.internalToken ?? "phase00-test-internal-token"))
					return { kind: "host", subjectId: "smoke-host" };
				return verifyPrincipalToken(
					authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
					config.webApp.sessionSecret ?? "smoke-session-secret-must-be-32-chars",
					"api",
				);
			},
			ready: async () => true,
			guildDirectory: {
				async get(id) {
					const guild = await prisma.guild.findUnique({ where: { id }, select: { id: true } });
					return guild ? { id: guild.id, configured: true } : undefined;
				},
			},
			repository,
			publisher: transport,
			recordVote: async () => {},
		});
		const address = await app.listen({ host: "127.0.0.1", port: 0 });
		serverUrl = address;
		const hostToken = `Bearer ${config.api.internalToken ?? "phase00-test-internal-token"}`;
		const requestHeaders = {
			authorization: hostToken,
			"idempotency-key": idempotencyKey,
			"x-correlation-id": correlationId,
		};
		const response = await fetch(new URL("/internal/v1/smoke", serverUrl), {
			method: "POST",
			headers: { ...requestHeaders, "content-type": "application/json" },
			body: JSON.stringify({ correlationId }),
		});
		assert.equal(response.status, 202);
		assert.equal(response.headers.get("x-correlation-id"), correlationId);
		const accepted = (await response.json()) as { id: string };
		operationIds.push(accepted.id);
		const duplicateRequest = await fetch(new URL("/internal/v1/smoke", serverUrl), {
			method: "POST",
			headers: { ...requestHeaders, "content-type": "application/json" },
			body: JSON.stringify({ correlationId }),
		});
		assert.equal(duplicateRequest.status, 202);
		assert.equal(((await duplicateRequest.json()) as { id: string }).id, accepted.id);

		await waitFor(async () => (await repository.get(accepted.id))?.status === "completed");
		await queue.add(
			"duplicate-delivery",
			{ version: 1, operationId: accepted.id },
			{ jobId: `at-least-once-${accepted.id}` },
		);
		await waitFor(
			async () =>
				(await queue.getJob(`at-least-once-${accepted.id}`))
					?.getState()
					.then((state) => state === "completed") ?? false,
		);
		const stored = await repository.get(accepted.id);
		assert.ok(stored);
		assert.equal(stored.status, "completed");
		assert.deepEqual(stored.payload, { correlationId });
		assert.deepEqual(effectCorrelationIds, [correlationId]);
		const effects = await prisma.operationEffect.findMany({
			where: { operationId: accepted.id },
			select: { value: true },
		});
		assert.deepEqual(effects, [{ value: { correlationId } }]);

		const operationResponse = await fetch(
			new URL(`/internal/v1/operations/${accepted.id}`, serverUrl),
			{ headers: { authorization: hostToken, "x-correlation-id": correlationId } },
		);
		assert.equal(operationResponse.headers.get("x-correlation-id"), correlationId);
		assert.equal(((await operationResponse.json()) as { status: string }).status, "completed");

		const observed: string[] = [];
		const webClient = createHttpGuildClient({
			baseUrl: serverUrl,
			fetch: async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("x-correlation-id", correlationId);
				const result = await fetch(input, { ...init, headers });
				const value = result.headers.get("x-correlation-id");
				if (value) observed.push(value);
				return result;
			},
		});
		const tokenSecret = config.webApp.sessionSecret ?? "smoke-session-secret-must-be-32-chars";
		const guildToken = issuePrincipalToken(
			{
				kind: "guild",
				subjectId: "smoke-user",
				guildId,
				permissions: ["guilds:read"],
			},
			"api",
			tokenSecret,
		);
		assert.deepEqual(await webClient.getGuild(guildId, guildToken), {
			id: guildId,
			configured: true,
		});
		const swapped = issuePrincipalToken(
			{
				kind: "guild",
				subjectId: "smoke-user",
				guildId: `${guildId}-other`,
				permissions: ["guilds:read"],
			},
			"api",
			tokenSecret,
		);
		assert.equal(await webClient.getGuild(guildId, swapped), undefined);
		assert.deepEqual(observed, [correlationId, correlationId]);

		console.log(
			JSON.stringify({
				correlationId,
				operationId: accepted.id,
				boundaries: ["gateway-seam", "api", "postgresql", "redis-worker", "typed-web-client"],
				effectCount: 1,
				duplicateDelivery: "completed without a second effect",
				guessedGuildDenied: true,
				liveDiscordConnected: false,
				commandPublication: false,
			}),
		);
	} finally {
		try {
			await app?.close();
		} finally {
			try {
				await worker.drain();
			} finally {
				try {
					await transport.close();
				} finally {
					try {
						if (operationIds.length)
							await prisma.operationRecord.deleteMany({ where: { id: { in: operationIds } } });
						await prisma.guild.deleteMany({ where: { id: guildId } });
					} finally {
						try {
							await queue.close();
						} finally {
							redis.disconnect();
							await disconnectPrisma();
						}
					}
				}
			}
		}
	}
});
