import { AuditLogEvent, type Guild } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { resolveAuditExecutor } from "./audit.ts";
import { isLocked, recordJoin, triggerLockdown } from "./raid.ts";
import { type AntinukeModule, getConfig, punish } from "./service.ts";

/** Shared guard: if the module is enabled, attribute the action and punish the executor. */
async function handleViolation(
	guild: Guild,
	module: AntinukeModule,
	auditType: AuditLogEvent,
	targetId: string | null,
	reason: string,
): Promise<void> {
	if (await isFeatureBlocked(guild.id, "security")) return;
	const config = await getConfig(guild.id);
	if (!config?.enabled || !config[module]) return;
	const executorId = await resolveAuditExecutor(guild, auditType, targetId);
	if (!executorId) return;
	await punish(guild, config, executorId, reason);
}

export const securityEvents: RegisteredEvent[] = [
	defineEvent("channelCreate", {
		execute: (_c, channel) =>
			handleViolation(
				channel.guild,
				"antiChannel",
				AuditLogEvent.ChannelCreate,
				channel.id,
				"Unauthorized channel creation",
			),
	}),
	defineEvent("channelDelete", {
		execute: (_c, channel) => {
			if (!("guild" in channel)) return;
			return handleViolation(
				channel.guild,
				"antiChannel",
				AuditLogEvent.ChannelDelete,
				channel.id,
				"Unauthorized channel deletion",
			);
		},
	}),
	defineEvent("roleCreate", {
		execute: (_c, role) =>
			handleViolation(
				role.guild,
				"antiRole",
				AuditLogEvent.RoleCreate,
				role.id,
				"Unauthorized role creation",
			),
	}),
	defineEvent("roleDelete", {
		execute: (_c, role) =>
			handleViolation(
				role.guild,
				"antiRole",
				AuditLogEvent.RoleDelete,
				role.id,
				"Unauthorized role deletion",
			),
	}),
	defineEvent("guildBanAdd", {
		execute: (_c, ban) =>
			handleViolation(
				ban.guild,
				"antiBan",
				AuditLogEvent.MemberBanAdd,
				ban.user.id,
				"Unauthorized ban",
			),
	}),
	defineEvent("guildMemberRemove", {
		execute: (_c, member) =>
			handleViolation(
				member.guild,
				"antiKick",
				AuditLogEvent.MemberKick,
				member.id,
				"Unauthorized kick",
			),
	}),
	defineEvent("guildMemberAdd", {
		execute: (_c, member) => {
			if (!member.user.bot) return;
			return handleViolation(
				member.guild,
				"antiBotAdd",
				AuditLogEvent.BotAdd,
				member.id,
				"Unauthorized bot add",
			);
		},
	}),
	defineEvent("guildMemberAdd", {
		execute: async (client, member) => {
			if (await isFeatureBlocked(member.guild.id, "security")) return;
			const config = await getConfig(member.guild.id);
			if (!config?.antiRaid || isLocked(member.guild.id)) return;
			if (!recordJoin(member.guild.id, config.raidThreshold, config.raidWindowSec)) return;
			await triggerLockdown(
				member.guild,
				config,
				client,
				`Join flood detected (${config.raidThreshold}+ joins in ${config.raidWindowSec}s).`,
			);
		},
	}),
	defineEvent("webhooksUpdate", {
		execute: (_c, channel) =>
			handleViolation(
				channel.guild,
				"antiWebhook",
				AuditLogEvent.WebhookCreate,
				null,
				"Unauthorized webhook change",
			),
	}),
	defineEvent("guildUpdate", {
		execute: (_c, _old, updated) =>
			handleViolation(
				updated,
				"antiGuildUpdate",
				AuditLogEvent.GuildUpdate,
				updated.id,
				"Unauthorized server update",
			),
	}),
];
