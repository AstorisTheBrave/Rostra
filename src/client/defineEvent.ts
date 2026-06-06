import type { ClientEvents } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { getLogger } from "@/services/logger.ts";
import type { RegisteredEvent } from "@/types/module.ts";

const log = getLogger("event");

/**
 * Typed event registration factory. Keeps full `ClientEvents[K]` typing on `execute`
 * while erasing to a uniform `RegisteredEvent` for storage — avoids `any` across mixed handlers.
 * Every handler runs inside an error boundary so a throw never crashes the shard.
 */
export function defineEvent<K extends keyof ClientEvents>(
	name: K,
	opts: { once?: boolean; execute: (client: BotClient, ...args: ClientEvents[K]) => unknown },
): RegisteredEvent {
	return {
		name,
		once: opts.once ?? false,
		register(client) {
			const handler = (...args: unknown[]): void => {
				try {
					Promise.resolve(opts.execute(client, ...(args as ClientEvents[K]))).catch((err) =>
						log.error({ err, event: name }, "event handler rejected"),
					);
				} catch (err) {
					log.error({ err, event: name }, "event handler threw");
				}
			};
			if (opts.once) client.once(name, handler);
			else client.on(name, handler);
		},
	};
}
