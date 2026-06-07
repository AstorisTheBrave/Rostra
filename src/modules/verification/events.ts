import type { Client } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { schedule } from "@/services/scheduler.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { getConfig } from "./service.ts";

export const VERIFY_KICK = "verify_kick";

/** Scheduler handler: kick a member who never verified, unless they got the role in time. */
export async function verifyKickTask(payload: unknown, client: Client): Promise<void> {
	const { guildId, userId } = (payload ?? {}) as { guildId?: string; userId?: string };
	if (!guildId || !userId) return;
	const guild = client.guilds.cache.get(guildId);
	if (!guild) return;
	const config = await getConfig(guildId);
	if (!config?.enabled || !config.roleId || !config.kickAfterMin) return;
	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member?.kickable) return;
	if (member.roles.cache.has(config.roleId)) return; // verified in time
	await member.kick("[Verification] did not verify in time").catch(() => {});
}

export const verificationEvents: RegisteredEvent[] = [
	defineEvent("guildMemberAdd", {
		execute: async (client, member) => {
			if (member.user.bot) return;
			if (await isFeatureBlocked(member.guild.id, "verification")) return;
			const config = await getConfig(member.guild.id);
			if (!config?.enabled || !config.roleId || !config.kickAfterMin) return;
			await schedule(
				{
					type: VERIFY_KICK,
					runAt: new Date(Date.now() + config.kickAfterMin * 60_000),
					guildId: member.guild.id,
					payload: { guildId: member.guild.id, userId: member.id },
				},
				client,
			);
		},
	}),
];
