import { config } from "@/config.ts";
import { getLogger } from "@/services/logger.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { type Client, MessageFlags } from "discord.js";
import { LavalinkManager } from "lavalink-client";

const log = getLogger("music");

let manager: LavalinkManager | undefined;

/** Whether any Lavalink nodes are configured. */
export function isEnabled(): boolean {
	return config.lavalink.nodes.length > 0;
}

/** Lazily build the Lavalink manager (requires a logged-in client for ids). */
export function getManager(client: Client): LavalinkManager | undefined {
	if (!isEnabled()) return undefined;
	if (!manager) {
		manager = new LavalinkManager({
			nodes: config.lavalink.nodes.map((n) => ({
				id: n.id,
				host: n.host,
				port: n.port,
				authorization: n.password,
				secure: n.secure,
				retryAmount: config.lavalink.reconnectTries,
			})),
			sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
			client: { id: client.user?.id ?? config.discord.clientId, username: "Rostra" },
			autoSkip: true,
			playerOptions: {
				defaultSearchPlatform: "ytsearch",
				onEmptyQueue: { destroyAfterMs: 30_000 },
				onDisconnect: { autoReconnect: true, destroyPlayer: false },
			},
		});
	}
	return manager;
}

/** Initialize nodes + event listeners once the client is ready. */
export async function initMusic(client: Client): Promise<void> {
	const m = getManager(client);
	if (!m || !client.user) return;

	m.nodeManager.on("connect", (node) => log.info({ node: node.id }, "lavalink node connected"));
	m.nodeManager.on("error", (node, error) =>
		log.error({ node: node.id, err: error?.message }, "lavalink node error"),
	);

	m.on("trackStart", (player, track) => {
		void announce(
			client,
			player.textChannelId,
			`🎵 Now playing: **${track?.info.title ?? "Unknown"}**`,
		);
	});
	m.on("queueEnd", (player) => {
		void announce(client, player.textChannelId, "⏹️ Queue finished.");
	});

	// "raw" is emitted by the client but not part of the typed ClientEvents — register directly.
	(client as unknown as { on(event: string, listener: (packet: unknown) => void): void }).on(
		"raw",
		(packet) => handleRaw(packet),
	);

	await m.init({ id: client.user.id, username: client.user.username });
	log.info({ nodes: config.lavalink.nodes.length }, "music initialized");
}

async function announce(client: Client, channelId: string | null, message: string): Promise<void> {
	if (!channelId) return;
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) return;
	await channel
		.send({
			components: [container(Accent.info, [text(message)])],
			flags: MessageFlags.IsComponentsV2,
		})
		.catch(() => {});
}

/** Forward raw gateway packets so Lavalink tracks voice state. */
export function handleRaw(packet: unknown): void {
	manager?.sendRawData(packet as Parameters<LavalinkManager["sendRawData"]>[0]);
}
