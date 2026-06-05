import type { BotClient } from "@/client/BotClient.ts";
import { getLogger } from "@/services/logger.ts";
import type { BotModule, RegisteredEvent } from "@/types/module.ts";

const log = getLogger("loader:events");

/** Register module events plus any provided core events onto the client. */
export function registerEvents(
	client: BotClient,
	modules: BotModule[],
	coreEvents: RegisteredEvent[] = [],
): void {
	let count = 0;
	for (const event of coreEvents) {
		event.register(client);
		count++;
	}
	for (const module of modules) {
		for (const event of module.events ?? []) {
			event.register(client);
			count++;
		}
	}
	log.info({ count }, "events registered");
}
