import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { createIpc, type Ipc } from "@/cluster/ipc.ts";
import { getLogger } from "@/services/logger.ts";
import type { ComponentHandler, SlashCommand } from "@/types/module.ts";

const log = getLogger("client");

export class BotClient extends Client {
	readonly commands = new Collection<string, SlashCommand>();
	readonly components: ComponentHandler[] = [];
	/** Per-(command,user) cooldown timestamps for the in-memory fallback path. */
	readonly cooldowns = new Collection<string, number>();
	#ipc?: Ipc;

	constructor() {
		super({
			intents: [
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
			],
			partials: [
				Partials.Channel,
				Partials.GuildMember,
				Partials.Message,
				Partials.User,
				Partials.Reaction,
			],
		});
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
		const { loadLiveLocales, subscribeLocaleReload } = await import("@/i18n/live.ts");
		subscribeLocaleReload();
		await loadLiveLocales();

		log.info({ modules: modules.length, commands: this.commands.size }, "client initialized");
	}
}
