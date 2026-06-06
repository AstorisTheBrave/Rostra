import type { Client } from "discord.js";
import { config } from "@/config.ts";

export interface Ipc {
	readonly mode: "native" | "hybrid";
	/** Run a function on every shard's client; returns one result per shard. */
	broadcast<T>(fn: (client: Client) => T): Promise<T[]>;
	/** Convenience alias for broadcast, named for value collection. */
	fetchValues<T>(fn: (client: Client) => T): Promise<T[]>;
}

class NativeIpc implements Ipc {
	readonly mode = "native" as const;
	constructor(private readonly client: Client) {}

	async broadcast<T>(fn: (client: Client) => T): Promise<T[]> {
		if (this.client.shard) {
			return (await this.client.shard.broadcastEval(fn)) as T[];
		}
		// Single-process (no ShardingManager): run locally.
		return [fn(this.client)];
	}

	fetchValues<T>(fn: (client: Client) => T): Promise<T[]> {
		return this.broadcast(fn);
	}
}

/**
 * Returns the IPC implementation for the current sharding mode.
 * Modules use this interface only; swapping to hybrid-sharding later is a
 * config change (`SHARDING_MODE=hybrid`) plus a HybridIpc class - no module edits.
 */
export function createIpc(client: Client): Ipc {
	if (config.sharding.mode === "hybrid") {
		// HybridIpc lands with the hybrid-sharding dependency in the runtime plan;
		// the interface is identical, so this falls back to native until then.
		return new NativeIpc(client);
	}
	return new NativeIpc(client);
}
