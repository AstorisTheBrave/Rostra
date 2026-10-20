import { getLogger } from "@rostra/logger";
import type { BotClient } from "@/client/BotClient.ts";
import type { BotModule, RegisteredEvent } from "@/types/module.ts";

const log = getLogger("loader:events");
const registrations = new WeakMap<BotClient, () => void>();

/** Register module events plus any provided core events onto the client. */
export function registerEvents(
	client: BotClient,
	modules: BotModule[],
	coreEvents: RegisteredEvent[] = [],
): () => void {
	registrations.get(client)?.();
	const disposers: Array<() => void> = [];
	let count = 0;
	try {
		for (const event of coreEvents) {
			disposers.push(event.register(client));
			count++;
		}
		for (const module of modules) {
			for (const event of module.events ?? []) {
				disposers.push(event.register(client));
				count++;
			}
		}
	} catch (error) {
		for (const dispose of disposers) dispose();
		throw error;
	}
	const dispose = (): void => {
		if (registrations.get(client) !== dispose) return;
		registrations.delete(client);
		for (const remove of disposers) remove();
	};
	registrations.set(client, dispose);
	log.info({ count }, "events registered");
	return dispose;
}
