import type { Interaction } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { runWithLocale } from "@/i18n/index.ts";
import { DEFAULT_LOCALE } from "@/i18n/locales.ts";
import { runCommand } from "@/pipeline/runCommand.ts";
import { resolveLocale } from "@/services/localization.ts";
import { getLogger } from "@/services/logger.ts";
import { withSafeAck } from "@/utils/safeAck.ts";

const log = getLogger("router");

/** Resolve the locale for the user driving a component/modal interaction. */
async function componentLocale(interaction: Interaction): Promise<string> {
	try {
		return await resolveLocale({
			userId: interaction.user.id,
			guildId: interaction.guildId ?? undefined,
			interactionLocale: interaction.locale,
			scope: "actor",
		});
	} catch {
		return DEFAULT_LOCALE;
	}
}

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
			const locale = await componentLocale(interaction);
			try {
				await runWithLocale(locale, () =>
					withSafeAck(interaction, async () => handler.execute(interaction, args, client), {
						ephemeral: handler.deferEphemeral,
						heartbeat: handler.heartbeat,
					}),
				);
			} catch (err) {
				log.error({ err, customId: interaction.customId }, "component handler failed");
			}
		}
	},
});
