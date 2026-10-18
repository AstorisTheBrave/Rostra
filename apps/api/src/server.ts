import rateLimit from "@fastify/rate-limit";
import {
	AuthorizationError,
	type Principal,
	requireHost,
	requireOperationRead,
	verifySecret,
} from "@rostra/auth";
import { getLogger } from "@rostra/logger";
import type {
	NewOperation,
	OperationPublisher,
	OperationRecord,
	OperationRepository,
} from "@rostra/operations";
import { createAndPublishOperation, IdempotencyConflictError } from "@rostra/operations";
import Fastify, { type FastifyInstance } from "fastify";
import { parseVotePayload, type VotePayload } from "./vote.ts";

const log = getLogger("api:http");

export interface ApiDependencies {
	authenticate(
		authorization: string | undefined,
	): Promise<Principal | undefined> | Principal | undefined;
	voteToken?: string;
	ready(): Promise<boolean>;
	repository: OperationRepository;
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
	const app = Fastify({ logger: false });
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
		try {
			operation = await createAndPublishOperation(deps.repository, deps.publisher, input);
		} catch (error) {
			if (error instanceof IdempotencyConflictError) {
				reply.code(409);
				return { error: error.code };
			}
			log.error({ err: error }, "durable operation delivery failed");
			reply.code(503);
			return { error: "delivery_unavailable" };
		}
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
			requireOperationRead(principal, operation.guildId);
		} catch (error) {
			if (!(error instanceof AuthorizationError)) throw error;
			reply.code(404);
			return { error: "not_found" };
		}
		return publicOperation(operation);
	});

	return app;
}
