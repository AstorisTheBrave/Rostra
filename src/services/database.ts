import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("database");
let client: PrismaClient | undefined;

/**
 * Cached PrismaClient singleton. The ONLY place a client is constructed.
 *
 * Prisma 7 removed the implicit query engine, so the client is built on a driver
 * adapter (node-postgres). The connection URL comes from the validated `config`
 * loader, never from raw process.env.
 */
export function getPrisma(): PrismaClient {
	if (!client) {
		const adapter = new PrismaPg({ connectionString: config.database.url });
		client = new PrismaClient({
			adapter,
			log: config.env === "development" ? ["warn", "error"] : ["error"],
		});
		log.info("prisma client initialized");
	}
	return client;
}

export async function disconnectPrisma(): Promise<void> {
	if (client) {
		await client.$disconnect();
		client = undefined;
		log.info("prisma client disconnected");
	}
}
