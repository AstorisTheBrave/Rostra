import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { initMusic, isEnabled } from "./service.ts";

export const musicEvents: RegisteredEvent[] = [
	defineEvent("ready", {
		once: true,
		execute: async (client) => {
			// initMusic also wires the untyped "raw" gateway listener for voice updates.
			if (isEnabled()) await initMusic(client);
		},
	}),
];
