import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import { PrismaClient } from "@prisma/client";

const log = getLogger("database");
let client: PrismaClient | undefined;

/** Cached PrismaClient singleton. The ONLY place a client is constructed. */
export function getPrisma(): PrismaClient {
	if (!client) {
		client = new PrismaClient({
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
