import { REST, Routes } from "discord.js";
import { BotClient } from "@/client/BotClient.ts";
import { collectCommandJSON, registerCommands } from "@/client/loaders/commands.ts";
import { loadModules } from "@/client/loaders/modules.ts";
import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("deploy");

async function main(): Promise<void> {
	const client = new BotClient();
	const modules = await loadModules();
	registerCommands(client, modules);
	const body = collectCommandJSON(client);

	const rest = new REST().setToken(config.discord.token);
	await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
	log.info({ count: body.length }, "registered global application commands");
	process.exit(0);
}

main().catch((err) => {
	log.error({ err }, "command deployment failed");
	process.exit(1);
});
