import type { Client } from "discord.js";
import type { ClusterClient } from "discord-hybrid-sharding";
import { config } from "@/config.ts";

export interface Ipc {
	readonly mode: "native" | "hybrid";
	/** Run a function on every shard's client; returns one result per shard/cluster. */
	broadcast<T>(fn: (client: Client) => T): Promise<T[]>;
	/** Convenience alias for broadcast, named for value collection. */
	fetchValues<T>(fn: (client: Client) => T): Promise<T[]>;
}

/** A client that may carry a discord-hybrid-sharding ClusterClient (hybrid mode). */
interface ClusterAware {
	cluster?: ClusterClient<Client>;
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
 * Hybrid clustering IPC over discord-hybrid-sharding's ClusterClient. Each call
 * fans out to every cluster (and thus every shard) via the cluster bridge. Falls
 * back to a local call if the ClusterClient is not attached yet.
 */
class HybridIpc implements Ipc {
	readonly mode = "hybrid" as const;
	constructor(private readonly client: Client) {}

	async broadcast<T>(fn: (client: Client) => T): Promise<T[]> {
		const cluster = (this.client as Client & ClusterAware).cluster;
		if (cluster) {
			return (await cluster.broadcastEval(fn as (c: Client) => T)) as T[];
		}
		return [fn(this.client)];
	}

	fetchValues<T>(fn: (client: Client) => T): Promise<T[]> {
		return this.broadcast(fn);
	}
}

/**
 * Returns the IPC implementation for the current sharding mode. Modules use this
 * interface only, so switching native <-> hybrid is a config change
 * (`SHARDING_MODE`) with no module edits.
 */
export function createIpc(client: Client): Ipc {
	return config.sharding.mode === "hybrid" ? new HybridIpc(client) : new NativeIpc(client);
}
