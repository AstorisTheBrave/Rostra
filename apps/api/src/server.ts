import rateLimit from "@fastify/rate-limit";
import {
	AuthorizationError,
	type GuildCapability,
	type GuildCapabilityStore,
	type Principal,
	requireGuildPermission,
	requireHost,
	requireOperationRead,
	resolveGuildCapabilities,
	verifySecret,
} from "@rostra/auth";
import { getLogger } from "@rostra/logger";
import type {
	NewOperation,
	OperationOutboxRepository,
	OperationPublisher,
	OperationRecord,
	OperationRepository,
} from "@rostra/operations";
import { createAndRelayOperation, IdempotencyConflictError } from "@rostra/operations";
import type { GuildSummary } from "@rostra/web-client";
import Fastify, { type FastifyInstance } from "fastify";
import { parseVotePayload, type VotePayload } from "./vote.ts";

const log = getLogger("api:http");

export interface ApiDependencies {
	authenticate(
		authorization: string | undefined,
	): Promise<Principal | undefined> | Principal | undefined;
	voteToken?: string;
	ready(): Promise<boolean>;
	guildDirectory: {
		get(guildId: string): Promise<GuildSummary | undefined>;
	};
	guildCapabilities: GuildCapabilityStore;
	repository: OperationRepository & OperationOutboxRepository;
	publisher: OperationPublisher;
	recordVote(vote: VotePayload): Promise<void>;
}

async function principalFor(
	request: { headers: { authorization?: string } },
	deps: ApiDependencies,
) {
	return deps.authenticate(request.headers.authorization);
}

function publicOperation(operation: OperationRecord) {
	return {
		id: operation.id,
		guildId: operation.guildId,
		kind: operation.kind,
		status: operation.status,
		createdAt: operation.createdAt.toISOString(),
		updatedAt: operation.updatedAt.toISOString(),
	};
}

function idempotencyKey(value: string | string[] | undefined): string | undefined {
	return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : undefined;
}

export async function createApi(deps: ApiDependencies): Promise<FastifyInstance> {
	const app = Fastify({ logger: false, requestIdHeader: "x-correlation-id" });
	app.addHook("onSend", async (request, reply, payload) => {
		reply.header("x-correlation-id", request.id);
		return payload;
	});
	app.setErrorHandler((error, _request, reply) => {
		log.error({ err: error }, "api request failed");
		return reply.code(500).send({ error: "internal_error" });
	});
	await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

	app.get("/health/live", async () => ({ status: "ok" }));
	app.get("/health/ready", async (_request, reply) => {
		const ready = await deps.ready().catch(() => false);
		if (!ready) reply.code(503);
		return { status: ready ? "ready" : "not_ready" };
	});

	app.get<{ Params: { guildId: string } }>(
		"/internal/v1/guilds/:guildId/summary",
		async (request, reply) => {
			const principal = await principalFor(request, deps);
			if (!principal) {
				reply.code(401);
				return { error: "unauthorized" };
			}
			try {
				requireGuildPermission(principal, request.params.guildId, "guilds:read");
			} catch (error) {
				if (!(error instanceof AuthorizationError)) throw error;
				reply.code(404);
				return { error: "not_found" };
			}
			const guild = await deps.guildDirectory.get(request.params.guildId);
			if (!guild) {
				reply.code(404);
				return { error: "not_found" };
			}
			return guild;
		},
	);

	app.post(
		"/votes/topgg",
		{ config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
		async (request, reply) => {
			const authorization = request.headers.authorization;
			if (!verifySecret(authorization, deps.voteToken)) {
				reply.code(401);
				return { error: "unauthorized" };
			}
			const vote = parseVotePayload(request.body);
			if (!vote) {
				reply.code(400);
				return { error: "bad request" };
			}
			await deps.recordVote(vote);
			return { ok: true };
		},
	);

	app.post("/internal/v1/smoke", async (request, reply) => {
		const principal = await principalFor(request, deps);
		if (!principal) {
			reply.code(401);
			return { error: "unauthorized" };
		}
		try {
			requireHost(principal);
		} catch (error) {
			if (!(error instanceof AuthorizationError)) throw error;
			reply.code(403);
			return { error: "forbidden" };
		}
		const key = idempotencyKey(request.headers["idempotency-key"]);
		if (!key) {
			reply.code(400);
			return { error: "idempotency_key_required" };
		}
		const input: NewOperation = {
			kind: "phase00.smoke",
			idempotencyKey: key,
			payload: typeof request.body === "object" && request.body !== null ? request.body : {},
		};
		let operation: OperationRecord;
		let delivery: "published" | "degraded" | "busy";
		try {
			({ record: operation, delivery } = await createAndRelayOperation(
				deps.repository,
				deps.publisher,
				input,
			));
		} catch (error) {
			if (error instanceof IdempotencyConflictError) {
				reply.code(409);
				return { error: error.code };
			}
			log.error({ err: error }, "durable operation creation failed");
			reply.code(503);
			return { error: "storage_unavailable" };
		}
		if (delivery === "degraded")
			log.warn(
				{ correlationId: request.id, operationId: operation.id },
				"operation delivery deferred to relay",
			);
		log.info({ correlationId: request.id, operationId: operation.id }, "smoke operation accepted");
		reply.code(202);
		return publicOperation(operation);
	});

	app.get<{ Params: { id: string } }>("/internal/v1/operations/:id", async (request, reply) => {
		const principal = await principalFor(request, deps);
		if (!principal) {
			reply.code(401);
			return { error: "unauthorized" };
		}
		const operation = await deps.repository.get(request.params.id);
		if (!operation) {
			reply.code(404);
			return { error: "not_found" };
		}
		try {
			if (operation.guildId === null) requireOperationRead(principal, null);
			else
				await requireCurrentGuildCapability(principal, operation.guildId, "operations:read", deps);
		} catch (error) {
			if (!(error instanceof AuthorizationError)) throw error;
			reply.code(404);
			return { error: "not_found" };
		}
		return publicOperation(operation);
	});

	return app;
}

async function requireCurrentGuildCapability(
	principal: Principal,
	guildId: string,
	capability: GuildCapability,
	deps: ApiDependencies,
): Promise<void> {
	const guildPrincipal = requireGuildPermission(principal, guildId, capability);
	const current = await resolveGuildCapabilities(
		deps.guildCapabilities,
		guildPrincipal.subjectId,
		guildId,
	);
	if (!current.includes(capability)) throw new AuthorizationError("Guild authorization required");
}
