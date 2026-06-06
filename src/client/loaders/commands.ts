import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { registerLocale } from "@/i18n/index.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule } from "@/types/module.ts";

const log = getLogger("loader:commands");

/** Fill the client command collection and register each module's i18n strings. */
export function registerCommands(client: BotClient, modules: BotModule[]): void {
	for (const module of modules) {
		if (module.i18n) registerLocale("en", module.name, module.i18n);
		for (const command of module.commands ?? []) {
			const name = command.data.name;
			if (client.commands.has(name)) {
				log.warn({ command: name, module: module.name }, "duplicate command name - skipped");
				continue;
			}
			client.commands.set(name, command);
		}
	}
	log.info({ count: client.commands.size }, "commands registered");
}

/** Build the JSON payload for Discord command registration. */
export function collectCommandJSON(client: BotClient): RESTPostAPIApplicationCommandsJSONBody[] {
	return [...client.commands.values()].map((c) => c.data.toJSON());
}
