import { defineEvent } from "@/client/defineEvent.ts";
import { runCommand } from "@/pipeline/runCommand.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("router");

export interface ParsedCustomId {
	prefix: string;
	args: string[];
}

/** Split a "prefix:action:scope:arg" customId into its prefix and remaining segments. */
export function parseCustomId(customId: string): ParsedCustomId {
	const [prefix, ...args] = customId.split(":");
	return { prefix: prefix ?? "", args };
}

/** Core interactionCreate handler: routes commands, autocomplete, and component/modal interactions. */
export const interactionRouter = defineEvent("interactionCreate", {
	execute: async (client, interaction) => {
		if (interaction.isChatInputCommand()) {
			await runCommand(interaction, client);
			return;
		}
		if (interaction.isAutocomplete()) {
			const command = client.commands.get(interaction.commandName);
			await command?.autocomplete?.(interaction, client);
			return;
		}
		if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
			const { prefix, args } = parseCustomId(interaction.customId);
			const handler = client.components.find((h) => h.prefix === prefix);
			if (!handler) return;
			try {
				await handler.execute(interaction, args, client);
			} catch (err) {
				log.error({ err, customId: interaction.customId }, "component handler failed");
			}
		}
	},
});
