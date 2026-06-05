import { config } from "@/config.ts";
import type { SlashCommand } from "@/types/module.ts";
import type { ChatInputCommandInteraction } from "discord.js";

export type PermissionReason = "owner" | "guild" | "userPerms" | "botPerms";

export interface PermissionResult {
	ok: boolean;
	reason?: PermissionReason;
}

/** Validate owner-only, guild-only, and user/bot permission requirements before execution. */
export function checkPermissions(
	interaction: ChatInputCommandInteraction,
	command: SlashCommand,
): PermissionResult {
	if (command.ownerOnly && !config.discord.ownerIds.includes(interaction.user.id)) {
		return { ok: false, reason: "owner" };
	}
	if (command.guildOnly && !interaction.inGuild()) {
		return { ok: false, reason: "guild" };
	}
	if (command.userPermissions?.length) {
		const perms = interaction.memberPermissions;
		if (!perms || !perms.has(command.userPermissions)) {
			return { ok: false, reason: "userPerms" };
		}
	}
	if (command.botPermissions?.length && interaction.inGuild()) {
		const me = interaction.guild?.members.me;
		if (!me || !me.permissions.has(command.botPermissions)) {
			return { ok: false, reason: "botPerms" };
		}
	}
	return { ok: true };
}

/** i18n key for a denied permission reason. */
export function permissionMessageKey(reason: PermissionReason): string {
	switch (reason) {
		case "owner":
			return "common:error.missingPermissions";
		case "guild":
			return "common:error.guildOnly";
		case "botPerms":
			return "common:error.botMissingPermissions";
		default:
			return "common:error.missingPermissions";
	}
}
