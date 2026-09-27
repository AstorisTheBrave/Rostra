import { type Client, type GuildMember, MessageFlags } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { t } from "@/i18n/index.ts";
import { schedule } from "@/services/scheduler.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/ui";
import { accountAgeDays, eligibleAt } from "./accountAge.ts";
import { getConfig } from "./service.ts";

export const VERIFY_KICK = "verify_kick";

interface VerifyKickPayload {
	guildId?: string;
	userId?: string;
	/** Join generation in epoch milliseconds; absent on legacy tasks. */
	joinedAt?: number;
	roleId?: string;
	kickAfterMin?: number;
}

export function isCurrentVerifyKick(
	payload: VerifyKickPayload,
	memberJoinedAt: number | null,
	configuredRoleId: string,
	configuredKickAfterMin: number,
	now = Date.now(),
): boolean {
	return (
		payload.joinedAt !== undefined &&
		payload.joinedAt === memberJoinedAt &&
		payload.roleId === configuredRoleId &&
		payload.kickAfterMin === configuredKickAfterMin &&
		now >= payload.joinedAt + configuredKickAfterMin * 60_000
	);
}

/** Scheduler handler: kick a member who never verified, unless they got the role in time. */
export async function verifyKickTask(payload: unknown, client: Client): Promise<void> {
	const { guildId, userId, joinedAt, roleId, kickAfterMin } = (payload ?? {}) as VerifyKickPayload;
	if (!guildId || !userId) return;
	const guild = client.guilds.cache.get(guildId);
	if (!guild) return;
	const config = await getConfig(guildId);
	if (
		!config?.enabled ||
		!config.roleId ||
		!config.kickAfterMin ||
		(await isFeatureBlocked(guildId, "verification"))
	)
		return;
	// Tasks without a join/config generation cannot safely act on a rejoined member.
	const member = await guild.members.fetch(userId).catch(() => null);
	if (!member || member.id === guild.ownerId || !member.kickable) return;
	// A user may leave and rejoin before an older durable task fires. New tasks carry
	// the join timestamp so an old generation cannot kick the user's newer session early.
	if (
		!isCurrentVerifyKick(
			{ joinedAt, roleId, kickAfterMin },
			member.joinedTimestamp,
			config.roleId,
			config.kickAfterMin,
		)
	)
		return;
	if (member.roles.cache.has(config.roleId)) return; // verified in time
	await member.kick("[Verification] did not verify in time").catch(() => {});
}

/** DM a member being kicked for an account that is too new, then return. Best-effort. */
async function dmAgeKick(member: GuildMember, minDays: number): Promise<void> {
	const eligible = eligibleAt(member.id, minDays);
	const when = eligible ? `<t:${Math.floor(eligible.getTime() / 1000)}:D>` : "a later date";
	await member
		.send({
			components: [
				container(Accent.warn, [
					text(
						t("verification:ageKick.dm", {
							server: member.guild.name,
							days: minDays,
							eligible: when,
						}),
					),
				]),
			],
			flags: MessageFlags.IsComponentsV2,
		})
		.catch(() => {});
}

export const verificationEvents: RegisteredEvent[] = [
	defineEvent("guildMemberAdd", {
		execute: async (client, member) => {
			if (member.user.bot) return;
			if (await isFeatureBlocked(member.guild.id, "verification")) return;
			const config = await getConfig(member.guild.id);
			if (!config) return;

			// Account-age gate: kick accounts younger than the minimum (cheap ban-evasion
			// signal). DM first since the kick can sever the DM channel. Never kicks the owner.
			if (config.minAccountAgeDays && member.id !== member.guild.ownerId) {
				if (accountAgeDays(member.id) < config.minAccountAgeDays && member.kickable) {
					await dmAgeKick(member, config.minAccountAgeDays);
					await member
						.kick(`[Verification] account younger than ${config.minAccountAgeDays}d`)
						.catch(() => {});
					return; // kicked - skip the verify-kick schedule
				}
			}

			// Auto-kick members who never verify within the window. Include this exact
			// join generation so an old task is harmless if the user leaves and rejoins.
			if (config.enabled && config.roleId && config.kickAfterMin) {
				const joinedAt = member.joinedTimestamp ?? Date.now();
				await schedule(
					{
						type: VERIFY_KICK,
						runAt: new Date(joinedAt + config.kickAfterMin * 60_000),
						guildId: member.guild.id,
						payload: {
							guildId: member.guild.id,
							userId: member.id,
							joinedAt,
							roleId: config.roleId,
							kickAfterMin: config.kickAfterMin,
						},
					},
					client,
				);
			}
		},
	}),
];
