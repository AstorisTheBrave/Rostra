import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import { recordVote, type VotePayload, verifyVoteAuth } from "@/services/topgg.ts";

const log = getLogger("web");

export interface ShardStat {
	id: number;
	guilds: number;
	ping: number;
}

export interface WebDeps {
	/** Returns per-shard stats aggregated from the manager via IPC. */
	shardStats: () => Promise<ShardStat[]>;
}

/** Start the Fastify server: health/metrics endpoints + the top.gg vote webhook. */
export async function startWebServer(deps: WebDeps): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	// Per-IP rate limiting. The generous global ceiling leaves room for health
	// pollers/load balancers; the public webhook gets a tighter per-route cap.
	await app.register(rateLimit, {
		global: true,
		max: 300,
		timeWindow: "1 minute",
	});

	app.get("/health", async () => ({ status: "ok" }));

	app.get("/health/shards", async () => {
		const shards = await deps.shardStats();
		return { shards, total: shards.reduce((sum, s) => sum + s.guilds, 0) };
	});

	app.get("/metrics", async () => ({
		uptime: process.uptime(),
		memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
	}));

	app.post(
		"/votes/topgg",
		{ config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
		async (request, reply) => {
			if (!verifyVoteAuth(request.headers.authorization)) {
				reply.code(401);
				return { error: "unauthorized" };
			}
			const vote = request.body as VotePayload | undefined;
			if (!vote?.user) {
				reply.code(400);
				return { error: "bad request" };
			}
			await recordVote(vote);
			return { ok: true };
		},
	);

	await app.listen({ port: config.web.port, host: config.web.host });
	log.info({ port: config.web.port, host: config.web.host }, "web server listening");
	return app;
}
