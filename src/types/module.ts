import type {
	AutocompleteInteraction,
	Awaitable,
	ChatInputCommandInteraction,
	ClientEvents,
	MessageComponentInteraction,
	ModalSubmitInteraction,
	PermissionResolvable,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";

export interface CommandContext {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}

export interface SlashCommand {
	data: { toJSON(): RESTPostAPIApplicationCommandsJSONBody; name: string };
	ownerOnly?: boolean;
	guildOnly?: boolean;
	cooldownMs?: number;
	userPermissions?: PermissionResolvable[];
	botPermissions?: PermissionResolvable[];
	/** When the safe-ack helper auto-defers a slow command, defer ephemerally. */
	deferEphemeral?: boolean;
	/** Emit periodic "still working…" updates for genuinely long-running commands. */
	heartbeat?: boolean;
	execute(ctx: CommandContext): Awaitable<void>;
	autocomplete?(interaction: AutocompleteInteraction, client: BotClient): Awaitable<void>;
}

export interface ComponentHandler {
	/** Matches the first segment of a customId "prefix:action:...". */
	prefix: string;
	/** When the safe-ack helper auto-defers a slow handler, defer ephemerally. */
	deferEphemeral?: boolean;
	/** Emit periodic "still working…" updates for genuinely long-running handlers. */
	heartbeat?: boolean;
	execute(
		interaction: MessageComponentInteraction | ModalSubmitInteraction,
		args: string[],
		client: BotClient,
	): Awaitable<void>;
}

export interface RegisteredEvent {
	name: keyof ClientEvents;
	once: boolean;
	register(client: BotClient): void;
}

export interface JobDefinition {
	name: string;
	/** Optional cron expression for scheduled jobs. */
	cron?: string;
	handler(payload: unknown): Awaitable<void>;
}

export interface BotModule {
	name: string;
	commands?: SlashCommand[];
	events?: RegisteredEvent[];
	components?: ComponentHandler[];
	jobs?: JobDefinition[];
	/** English strings, registered under namespace = module name. */
	i18n?: Record<string, string>;
}
