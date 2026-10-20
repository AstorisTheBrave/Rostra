import type { Subscription } from "@rostra/cache/bus";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import { superviseModuleLifecycles } from "@rostra/module-sdk";
import { Client, type ClientOptions, Collection, GatewayIntentBits, Partials } from "discord.js";
import { ClusterClient, getInfo } from "discord-hybrid-sharding";
import { createIpc, type Ipc } from "@/cluster/ipc.ts";
import type { ComponentHandler, SlashCommand } from "@/types/module.ts";

const log = getLogger("client");

export const GATEWAY_INTENTS = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMembers,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.MessageContent,
	GatewayIntentBits.GuildVoiceStates,
	GatewayIntentBits.GuildModeration,
	GatewayIntentBits.GuildExpressions,
	GatewayIntentBits.GuildInvites,
	GatewayIntentBits.GuildWebhooks,
	GatewayIntentBits.GuildPresences,
	GatewayIntentBits.GuildMessageReactions,
	GatewayIntentBits.DirectMessages,
] as const;

export const GATEWAY_PARTIALS = [
	Partials.Channel,
	Partials.GuildMember,
	Partials.Message,
	Partials.User,
	Partials.Reaction,
] as const;

/**
 * Shard options. In hybrid mode the cluster manager (discord-hybrid-sharding)
 * tells this process which shard ids it owns via `getInfo()`; in native mode the
 * discord.js ShardingManager sets SHARD_LIST/SHARD_COUNT and we leave the
 * defaults so discord.js reads them.
 */
function shardOptions(): Partial<ClientOptions> {
	if (config.sharding.mode !== "hybrid") return {};
	const info = getInfo();
	return { shards: info.SHARD_LIST, shardCount: info.TOTAL_SHARDS };
}

export class BotClient extends Client {
	readonly commands = new Collection<string, SlashCommand>();
	readonly components: ComponentHandler[] = [];
	/** Per-(command,user) cooldown timestamps for the in-memory fallback path. */
	readonly cooldowns = new Collection<string, number>();
	/** Present only in hybrid mode: the cluster bridge for cross-cluster broadcastEval. */
	readonly cluster?: ClusterClient<Client>;
	#ipc?: Ipc;
	#disposeEvents?: () => void;
	#busSubscriptions: Subscription[] = [];
	#modules?: ReturnType<typeof superviseModuleLifecycles>;

	constructor() {
		super({
			...shardOptions(),
			intents: GATEWAY_INTENTS,
			partials: GATEWAY_PARTIALS,
		});
		// Attach the cluster bridge so cross-cluster broadcastEval works in hybrid mode.
		if (config.sharding.mode === "hybrid") {
			this.cluster = new ClusterClient(this);
		}
	}

	get ipc(): Ipc {
		if (!this.#ipc) this.#ipc = createIpc(this);
		return this.#ipc;
	}

	/** Discover modules and register their gateway-owned commands, events, and components. */
	async init(): Promise<void> {
		this.#ipc = createIpc(this);
		const { loadModuleRegistry } = await import("@/client/loaders/modules.ts");
		const { registerCommands } = await import("@/client/loaders/commands.ts");
		const { registerEvents } = await import("@/client/loaders/events.ts");
		const { registerInteractions } = await import("@/client/loaders/interactions.ts");

		const { interactionRouter } = await import("@/interactions/router.ts");

		const loaded = await loadModuleRegistry();
		this.#modules = superviseModuleLifecycles(
			loaded.map(({ manifest, lifecycle }) => ({
				id: manifest.id,
				enabled: true,
				lifecycle,
			})),
		);
		try {
			const failed = new Set(
				(await this.#modules.start()).map(({ id, error }) => {
					log.error({ err: error, module: id }, "module start failed");
					return id;
				}),
			);
			const modules = loaded
				.filter(({ manifest }) => !failed.has(manifest.id))
				.map(({ module }) => module);
			registerCommands(this, modules);
			this.#disposeEvents = registerEvents(this, modules, [interactionRouter]);
			registerInteractions(this, modules);

			// Overlay live (DB) translations on the bundled baseline and subscribe to
			// fleet-wide reloads so language changes apply with no restart.
			const { loadLiveLocales, subscribeLocaleReload } = await import("@rostra/i18n/live");
			this.#busSubscriptions.push(subscribeLocaleReload());
			await loadLiveLocales();

			// Load global feature flags and subscribe to live flips/kill-switches.
			const { loadFeatureFlags, subscribeFeatureFlags } = await import(
				"@/services/featureFlags.ts"
			);
			this.#busSubscriptions.push(subscribeFeatureFlags());
			await loadFeatureFlags();

			log.info({ modules: modules.length, commands: this.commands.size }, "client initialized");
		} catch (error) {
			try {
				await this.destroy();
			} catch (cleanupError) {
				log.error({ err: cleanupError }, "client initialization cleanup failed");
			}
			throw error;
		}
	}

	override async destroy(): Promise<void> {
		for (const subscription of this.#busSubscriptions.splice(0)) subscription.dispose();
		try {
			this.#disposeEvents?.();
		} catch (error) {
			log.error({ err: error }, "event disposal failed");
		} finally {
			this.#disposeEvents = undefined;
		}
		try {
			for (const { id, phase, error } of (await this.#modules?.stop()) ?? [])
				log.error({ err: error, module: id, phase }, "module shutdown failed");
		} finally {
			await super.destroy();
		}
	}
}
