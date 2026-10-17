import { disconnectCache } from "@rostra/cache";
import { closeBus } from "@rostra/cache/bus";
import { config } from "@rostra/config";
import { disconnectPrisma } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import { BotClient } from "@/client/BotClient.ts";
import { disconnectJobs } from "@/jobs/queue.ts";
import { installShutdownHandlers, registerShutdown } from "@/lifecycle/shutdown.ts";
import { acquireIdentifySlot, releaseIdentifySlot } from "@/services/identify.ts";

const log = getLogger("bot");

process.on("unhandledRejection", (reason) => log.error({ reason }, "unhandled rejection"));
process.on("uncaughtException", (err) => log.error({ err }, "uncaught exception"));

async function main(): Promise<void> {
	const client = new BotClient();
	await client.init();

	registerShutdown(() => client.destroy());
	registerShutdown(disconnectJobs);
	registerShutdown(closeBus);
	registerShutdown(disconnectCache);
	registerShutdown(disconnectPrisma);
	installShutdownHandlers();

	// Hybrid clustering: serialise cluster logins fleet-wide to respect Discord's
	// identify concurrency, releasing the slot once this cluster is connected.
	if (config.sharding.mode === "hybrid") {
		await acquireIdentifySlot();
		client.once("ready", () => void releaseIdentifySlot());
	}

	await client.login(config.discord.token);
	log.info("shard logged in");
}

main().catch((err) => {
	log.error({ err }, "fatal boot error");
	process.exit(1);
});
