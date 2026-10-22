import { verifyBearer, verifyPrincipalToken } from "@rostra/auth";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import { PrismaOperationRepository } from "@rostra/operations";
import { createOperationQueueTransport } from "./queue.ts";
import { createApi } from "./server.ts";
import { recordVote } from "./vote.ts";

const log = getLogger("api");

async function main(): Promise<void> {
	const transport = createOperationQueueTransport(config.redis.url);
	const app = await createApi({
		authenticate: (authorization) => {
			if (verifyBearer(authorization, config.api.internalToken))
				return { kind: "host", subjectId: "internal-api" };
			return verifyPrincipalToken(
				authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
				config.webApp.sessionSecret,
				"api",
			);
		},
		guildDirectory: {
			async get(guildId) {
				const guild = await getPrisma().guild.findUnique({
					where: { id: guildId },
					select: { id: true },
				});
				return guild ? { id: guild.id, configured: true } : undefined;
			},
		},
		guildCapabilities: {
			async memberCapabilities(subjectId, guildId) {
				const member = await getPrisma().guildMember.findUnique({
					where: { guildId_userId: { guildId, userId: subjectId } },
					select: {
						roles: { select: { role: { select: { grants: { select: { capability: true } } } } } },
					},
				});
				return member?.roles.flatMap(({ role }) => role.grants.map(({ capability }) => capability));
			},
		},
		voteToken: config.topgg.webhookAuth,
		repository: new PrismaOperationRepository(),
		publisher: transport,
		recordVote,
		ready: async () => {
			await getPrisma().$queryRaw`SELECT 1`;
			return transport.ready();
		},
	});
	let closing = false;
	const close = async (signal: string) => {
		if (closing) return;
		closing = true;
		log.info({ signal }, "api shutdown started");
		await app.close();
		await transport.close();
		await disconnectPrisma();
		log.info("api shutdown complete");
	};
	process.on("SIGINT", () => void close("SIGINT"));
	process.on("SIGTERM", () => void close("SIGTERM"));
	await app.listen({ port: config.api.port, host: config.api.host });
	log.info({ port: config.api.port, host: config.api.host }, "api listening");
}

main().catch((error) => {
	log.error({ err: error }, "api boot failed");
	process.exitCode = 1;
});
