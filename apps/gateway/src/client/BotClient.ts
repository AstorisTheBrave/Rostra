import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
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

	/** Discover modules and register their commands, events, components, and jobs. */
	async init(): Promise<void> {
		this.#ipc = createIpc(this);
		const { loadModules } = await import("@/client/loaders/modules.ts");
		const { registerCommands } = await import("@/client/loaders/commands.ts");
		const { registerEvents } = await import("@/client/loaders/events.ts");
		const { registerInteractions } = await import("@/client/loaders/interactions.ts");
		const { registerJobs } = await import("@/client/loaders/jobs.ts");

		const { interactionRouter } = await import("@/interactions/router.ts");

		const modules = await loadModules();
		registerCommands(this, modules);
		registerEvents(this, modules, [interactionRouter]);
		registerInteractions(this, modules);
		await registerJobs(modules);

		// Overlay live (DB) translations on the bundled baseline and subscribe to
		// fleet-wide reloads so language changes apply with no restart.
		const { loadLiveLocales, subscribeLocaleReload } = await import("@rostra/i18n/live");
		subscribeLocaleReload();
		await loadLiveLocales();

		// Load global feature flags and subscribe to live flips/kill-switches.
		const { loadFeatureFlags, subscribeFeatureFlags } = await import("@/services/featureFlags.ts");
		subscribeFeatureFlags();
		await loadFeatureFlags();

		log.info({ modules: modules.length, commands: this.commands.size }, "client initialized");
	}
}
