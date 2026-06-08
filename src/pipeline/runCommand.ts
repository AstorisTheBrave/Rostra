import { randomUUID } from "node:crypto";
import type { ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { runWithLocale, t } from "@/i18n/index.ts";
import { DEFAULT_LOCALE } from "@/i18n/locales.ts";
import { resolveLocale } from "@/services/localization.ts";
import { getLogger } from "@/services/logger.ts";
import { reply } from "@/utils/components.ts";
import { withSafeAck } from "@/utils/safeAck.ts";
import { consume } from "./cooldown.ts";
import { checkPermissions, permissionMessageKey } from "./permissions.ts";

const log = getLogger("command");

/** Resolve the invoking user's locale, defaulting safely if config is unavailable. */
async function actorLocale(interaction: ChatInputCommandInteraction): Promise<string> {
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
	const locale = await actorLocale(interaction);
	try {
		return await runWithLocale(locale, () => runInner(interaction, client, command, traceId));
	} catch (err) {
		log.error({ err, traceId, command: interaction.commandName }, "command execution failed");
		try {
			await reply.error(interaction, t("common:error.generic", undefined, locale));
		} catch (replyErr) {
			log.error({ err: replyErr, traceId }, "failed to send error reply");
		}
	}
}

async function runInner(
	interaction: ChatInputCommandInteraction,
	client: BotClient,
	command: NonNullable<ReturnType<BotClient["commands"]["get"]>>,
	_traceId: string,
): Promise<void> {
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
	await withSafeAck(interaction, async () => command.execute({ interaction, client }), {
		ephemeral: command.deferEphemeral,
		heartbeat: command.heartbeat,
	});
}
