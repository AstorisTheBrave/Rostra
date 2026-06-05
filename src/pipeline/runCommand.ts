import { randomUUID } from "node:crypto";
import type { ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { getLogger } from "@/services/logger.ts";
import { reply } from "@/utils/components.ts";
import { consume } from "./cooldown.ts";
import { checkPermissions, permissionMessageKey } from "./permissions.ts";

const log = getLogger("command");

/** Full execution pipeline for a slash command: guard → cooldown → execute → error boundary. */
export async function runCommand(
	interaction: ChatInputCommandInteraction,
	client: BotClient,
): Promise<void> {
	const command = client.commands.get(interaction.commandName);
	if (!command) {
		log.warn({ command: interaction.commandName }, "unknown command");
		return;
	}
	const traceId = randomUUID();
	try {
		const perm = checkPermissions(interaction, command);
		if (!perm.ok && perm.reason) {
			await reply.error(interaction, t(permissionMessageKey(perm.reason)));
			return;
		}
		if (command.cooldownMs) {
			const cd = await consume(`${command.data.name}:${interaction.user.id}`, command.cooldownMs);
			if (!cd.ok) {
				await reply.error(
					interaction,
					t("common:error.cooldown", { seconds: Math.ceil(cd.retryAfterMs / 1000) }),
				);
				return;
			}
		}
		await command.execute({ interaction, client });
	} catch (err) {
		log.error({ err, traceId, command: interaction.commandName }, "command execution failed");
		try {
			await reply.error(interaction, t("common:error.generic"));
		} catch (replyErr) {
			log.error({ err: replyErr, traceId }, "failed to send error reply");
		}
	}
}
