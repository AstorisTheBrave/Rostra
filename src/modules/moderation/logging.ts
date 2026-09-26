import { type Guild, MessageFlags } from "discord.js";
import { getTenant } from "@/services/tenant.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { formatDuration } from "./duration.ts";
import { getCase } from "./service.ts";

/**
 * Publish a persisted moderation case to the tenant's dedicated moderation-log
 * channel. Logging is deliberately best-effort: a missing/deleted channel or a
 * Discord permission failure must never roll back an already completed action.
 */
export async function publishModerationCase(guild: Guild, caseNumber: number): Promise<void> {
	try {
		const tenant = await getTenant(guild.id);
		if (!tenant.modLogChannelId) return;

		const [moderationCase, channel] = await Promise.all([
			getCase(guild.id, caseNumber),
			guild.channels.fetch(tenant.modLogChannelId).catch(() => null),
		]);
		if (!moderationCase || !channel?.isTextBased()) return;

		const moderator =
			moderationCase.moderatorId === "AUTOMOD"
				? "Automod"
				: `<@${moderationCase.moderatorId}>`;
		const when = Math.floor(moderationCase.createdAt.getTime() / 1000);
		const lines = [
			`**Case:** #${moderationCase.caseNumber} • **Action:** \`${moderationCase.type}\``,
			`**Member:** <@${moderationCase.targetId}> (\`${moderationCase.targetId}\`)`,
			`**Moderator:** ${moderator}`,
			`**Reason:** ${moderationCase.reason ?? "-"}`,
			...(moderationCase.durationMs
				? [`**Duration:** ${formatDuration(moderationCase.durationMs)}`]
				: []),
			`**When:** <t:${when}:F>`,
		];

		await channel
			.send({
				components: [container(Accent.warn, [text("## 🛡️ Moderation action"), text(lines.join("\n"))])],
				flags: MessageFlags.IsComponentsV2,
			})
			.catch(() => {});
	} catch {
		// Best-effort operational logging. The moderation action already succeeded.
	}
}
