import { BotClient } from "@/client/BotClient.ts";
import { config } from "@/config.ts";
import { disconnectJobs } from "@/jobs/queue.ts";
import { installShutdownHandlers, registerShutdown } from "@/lifecycle/shutdown.ts";
import { disconnectCache } from "@/services/cache.ts";
import { disconnectPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("bot");

process.on("unhandledRejection", (reason) => log.error({ reason }, "unhandled rejection"));
process.on("uncaughtException", (err) => log.error({ err }, "uncaught exception"));

async function main(): Promise<void> {
	const client = new BotClient();
	await client.init();

	registerShutdown(() => client.destroy());
	registerShutdown(disconnectJobs);
	registerShutdown(disconnectCache);
	registerShutdown(disconnectPrisma);
	installShutdownHandlers();

	await client.login(config.discord.token);
	log.info("shard logged in");
}

main().catch((err) => {
	log.error({ err }, "fatal boot error");
	process.exit(1);
});
