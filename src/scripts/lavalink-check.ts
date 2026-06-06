import { LavalinkManager } from "lavalink-client";
import { config } from "@/config.ts";

/** Connectivity diagnostic: tries every configured Lavalink node and reports which connect. */
async function main(): Promise<void> {
	if (config.lavalink.nodes.length === 0) {
		console.log("No Lavalink nodes configured (LAVALINK_NODES).");
		process.exit(0);
	}
	const connected = new Set<string>();
	const failed = new Map<string, string>();

	const manager = new LavalinkManager({
		nodes: config.lavalink.nodes.map((n) => ({
			id: n.id,
			host: n.host,
			port: n.port,
			authorization: n.password,
			secure: n.secure,
			retryAmount: 1,
		})),
		sendToShard: () => {},
		client: { id: config.discord.clientId, username: "Rostra" },
	});

	manager.nodeManager.on("connect", (node) => connected.add(node.id));
	manager.nodeManager.on("error", (node, error) => failed.set(node.id, error?.message ?? "error"));

	await manager.init({ id: config.discord.clientId, username: "Rostra" });
	await new Promise((r) => setTimeout(r, 15000));

	console.log(`\nLavalink: ${connected.size}/${config.lavalink.nodes.length} nodes connected\n`);
	for (const n of config.lavalink.nodes) {
		const mark = connected.has(n.id) ? "✅" : "❌";
		const reason = !connected.has(n.id) && failed.has(n.id) ? ` — ${failed.get(n.id)}` : "";
		console.log(`${mark} ${n.id} (${n.host}:${n.port})${reason}`);
	}
	process.exit(0);
}

void main();
