import type { BotClient } from "@/client/BotClient.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule } from "@/types/module.ts";

const log = getLogger("loader:interactions");

/** Collect module component handlers (buttons/selects/modals) into the client registry. */
export function registerInteractions(client: BotClient, modules: BotModule[]): void {
	for (const module of modules) {
		for (const handler of module.components ?? []) {
			client.components.push(handler);
		}
	}
	log.info({ count: client.components.length }, "component handlers registered");
}
