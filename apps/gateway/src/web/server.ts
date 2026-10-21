import rateLimit from "@fastify/rate-limit";
import { verifyBearer } from "@rostra/auth";
import { coherentCacheMetrics } from "@rostra/cache";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

const log = getLogger("web");

export interface ShardStat {
	id: number;
	guilds: number;
	ping: number;
}

export interface WebDeps {
	internalToken?: string;
	/** Returns per-shard stats aggregated from the manager via IPC. */
	shardStats: () => Promise<ShardStat[]>;
}

/** Build gateway-only health and shard metrics. Domain webhooks belong to the API. */
export async function createWebServer(deps: WebDeps): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// Per-IP rate limiting. The generous global ceiling leaves room for health
	// pollers/load balancers; the public webhook gets a tighter per-route cap.
	await app.register(rateLimit, {
		global: true,
		max: 300,
		timeWindow: "1 minute",
	});

	app.get("/health", async () => ({ status: "ok" }));

	const hostOnly = async (request: FastifyRequest, reply: FastifyReply) => {
		if (!verifyBearer(request.headers.authorization, deps.internalToken))
			return reply.code(401).send({ error: "unauthorized" });
	};

	app.get("/internal/health/shards", { preHandler: hostOnly }, async () => {
		const shards = await deps.shardStats();
		return { shards, total: shards.reduce((sum, s) => sum + s.guilds, 0) };
	});

	app.get("/internal/metrics", { preHandler: hostOnly }, async () => ({
		uptime: process.uptime(),
		memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
		cache: coherentCacheMetrics(),
	}));
	return app;
}

export async function startWebServer(deps: WebDeps): Promise<FastifyInstance> {
	const app = await createWebServer({ ...deps, internalToken: config.api.internalToken });
	await app.listen({ port: config.web.port, host: config.web.host });
	log.info({ port: config.web.port, host: config.web.host }, "web server listening");
	return app;
}
