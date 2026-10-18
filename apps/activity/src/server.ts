import { AuthorizationError, type Principal, requireGuildPermission } from "@rostra/auth";
import Fastify, { type FastifyInstance } from "fastify";

export interface ActivityDependencies {
	authenticate(authorization: string | undefined): Principal | undefined;
}

function guildIdFrom(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const guildId = (value as Record<string, unknown>).guildId;
	return typeof guildId === "string" && guildId.length > 0 ? guildId : undefined;
}

export function createActivityApp(deps: ActivityDependencies): FastifyInstance {
	const app = Fastify({ logger: false });
	app.get("/health/live", async () => ({ status: "ok" }));
	app.post("/sessions", async (request, reply) => {
		const principal = deps.authenticate(request.headers.authorization);
		if (!principal) {
			reply.code(401);
			return { error: "unauthorized" };
		}
		const guildId = guildIdFrom(request.body);
		if (!guildId) {
			reply.code(400);
			return { error: "invalid_request" };
		}
		try {
			requireGuildPermission(principal, guildId, "activity:launch");
		} catch (error) {
			if (!(error instanceof AuthorizationError)) throw error;
			reply.code(404);
			return { error: "not_found" };
		}
		return { status: "authorized", guildId };
	});
	return app;
}
