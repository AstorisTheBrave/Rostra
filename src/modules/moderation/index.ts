import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import {
	type ChatInputCommandInteraction,
	type GuildMember,
	GuildMember as GuildMemberClass,
	PermissionFlagsBits,
	type PermissionResolvable,
	SlashCommandBuilder,
	type TextChannel,
} from "discord.js";
import { MAX_TIMEOUT_MS, formatDuration, parseDuration } from "./duration.ts";
import {
	type CaseType,
	addNote,
	banUser,
	deactivateCase,
	getCases,
	kickUser,
	removeTimeout,
	timeoutUser,
	unbanUser,
	warnUser,
} from "./service.ts";

const REASON = "reason";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("mod")
		.setDescription("Moderation tools")
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

	cmd.addSubcommand((s) =>
		s
			.setName("ban")
			.setDescription("Ban a user from the server")
			.addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
			.addStringOption((o) => o.setName(REASON).setDescription("Reason"))
			.addIntegerOption((o) =>
				o
					.setName("delete_days")
					.setDescription("Days of messages to delete (0-7)")
					.setMinValue(0)
					.setMaxValue(7),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("unban")
			.setDescription("Unban a user")
			.addStringOption((o) =>
				o.setName("user_id").setDescription("User ID to unban").setRequired(true),
			)
			.addStringOption((o) => o.setName(REASON).setDescription("Reason")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("kick")
			.setDescription("Kick a member")
			.addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
			.addStringOption((o) => o.setName(REASON).setDescription("Reason")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("timeout")
			.setDescription("Timeout a member")
			.addUserOption((o) => o.setName("user").setDescription("Member to timeout").setRequired(true))
			.addStringOption((o) =>
				o.setName("duration").setDescription("Duration e.g. 10m, 1h, 2d").setRequired(true),
			)
			.addStringOption((o) => o.setName(REASON).setDescription("Reason")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("untimeout")
			.setDescription("Remove a member's timeout")
			.addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
			.addStringOption((o) => o.setName(REASON).setDescription("Reason")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("warn")
			.setDescription("Warn a member")
			.addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
			.addStringOption((o) => o.setName(REASON).setDescription("Reason").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("warnings")
			.setDescription("List a member's warnings")
			.addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("removewarn")
			.setDescription("Remove a warning by case number")
			.addIntegerOption((o) => o.setName("case").setDescription("Case number").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("cases")
			.setDescription("List a member's moderation history")
			.addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("note")
			.setDescription("Add a private moderator note to a member")
			.addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
			.addStringOption((o) => o.setName("note").setDescription("Note text").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("purge")
			.setDescription("Bulk-delete recent messages")
			.addIntegerOption((o) =>
				o
					.setName("count")
					.setDescription("How many (1-100)")
					.setRequired(true)
					.setMinValue(1)
					.setMaxValue(100),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("slowmode")
			.setDescription("Set channel slowmode in seconds")
			.addIntegerOption((o) =>
				o
					.setName("seconds")
					.setDescription("0-21600")
					.setRequired(true)
					.setMinValue(0)
					.setMaxValue(21600),
			),
	);
	cmd.addSubcommand((s) => s.setName("lock").setDescription("Lock the current channel"));
	cmd.addSubcommand((s) => s.setName("unlock").setDescription("Unlock the current channel"));
	cmd.addSubcommand((s) =>
		s
			.setName("nick")
			.setDescription("Change a member's nickname")
			.addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
			.addStringOption((o) =>
				o.setName("nickname").setDescription("New nickname (empty to reset)"),
			),
	);
	return cmd;
}

function hasPerm(interaction: ChatInputCommandInteraction, perm: PermissionResolvable): boolean {
	return interaction.memberPermissions?.has(perm) ?? false;
}

async function denyNoPerm(interaction: ChatInputCommandInteraction): Promise<void> {
	await reply.error(interaction, t("common:error.missingPermissions"));
}

function formatCaseLine(c: {
	caseNumber: number;
	type: string;
	targetId: string;
	moderatorId: string;
	reason: string | null;
	createdAt: Date;
}): string {
	const when = Math.floor(c.createdAt.getTime() / 1000);
	const reason = c.reason ?? "—";
	return `**#${c.caseNumber}** \`${c.type}\` <@${c.targetId}> — ${reason} • <t:${when}:R> by <@${c.moderatorId}>`;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	messageKey: string,
	vars: Record<string, string | number>,
): Promise<void> {
	await reply.components(interaction, [container(Accent.success, [text(t(messageKey, vars))])]);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) {
		await reply.error(interaction, t("common:error.guildOnly"));
		return;
	}
	const sub = interaction.options.getSubcommand();
	const moderator = await guild.members.fetch(interaction.user.id);
	const reason = interaction.options.getString(REASON) ?? "No reason provided";

	const resolveMember = (): GuildMember | null => {
		const m = interaction.options.getMember("user");
		return m instanceof GuildMemberClass ? m : null;
	};

	switch (sub) {
		case "ban": {
			if (!hasPerm(interaction, PermissionFlagsBits.BanMembers)) return denyNoPerm(interaction);
			const target = interaction.options.getUser("user", true);
			const days = interaction.options.getInteger("delete_days") ?? 0;
			const res = await banUser({ guild, target, moderator, reason, deleteSeconds: days * 86400 });
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.ban", {
				user: target.tag,
				case: res.caseNumber ?? 0,
			});
		}
		case "unban": {
			if (!hasPerm(interaction, PermissionFlagsBits.BanMembers)) return denyNoPerm(interaction);
			const id = interaction.options.getString("user_id", true);
			const res = await unbanUser({ guild, targetId: id, moderator, reason });
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.unban", { user: id, case: res.caseNumber ?? 0 });
		}
		case "kick": {
			if (!hasPerm(interaction, PermissionFlagsBits.KickMembers)) return denyNoPerm(interaction);
			const target = resolveMember();
			if (!target) return void reply.error(interaction, t("moderation:error.userNotInServer"));
			const res = await kickUser({ target, moderator, reason });
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.kick", {
				user: target.user.tag,
				case: res.caseNumber ?? 0,
			});
		}
		case "timeout": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const target = resolveMember();
			if (!target) return void reply.error(interaction, t("moderation:error.userNotInServer"));
			const durationMs = parseDuration(interaction.options.getString("duration", true));
			if (!durationMs || durationMs > MAX_TIMEOUT_MS) {
				return void reply.error(interaction, t("moderation:error.invalidDuration"));
			}
			const res = await timeoutUser({ target, moderator, durationMs, reason });
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.timeout", {
				user: target.user.tag,
				duration: formatDuration(durationMs),
				case: res.caseNumber ?? 0,
			});
		}
		case "untimeout": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const target = resolveMember();
			if (!target) return void reply.error(interaction, t("moderation:error.userNotInServer"));
			const res = await removeTimeout({ target, moderator, reason });
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.untimeout", { user: target.user.tag });
		}
		case "warn": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const target = interaction.options.getUser("user", true);
			const res = await warnUser({
				guildId: guild.id,
				targetId: target.id,
				moderatorId: moderator.id,
				reason: interaction.options.getString(REASON, true),
			});
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.warn", {
				user: target.tag,
				case: res.caseNumber ?? 0,
			});
		}
		case "warnings":
		case "cases": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const target = interaction.options.getUser("user", true);
			const type: CaseType | undefined = sub === "warnings" ? "warn" : undefined;
			const cases = await getCases(guild.id, target.id, type);
			const titleKey = sub === "warnings" ? "moderation:warnings.title" : "moderation:cases.title";
			if (cases.length === 0) {
				return ok(
					interaction,
					sub === "warnings" ? "moderation:warnings.none" : "moderation:cases.none",
					{
						user: target.tag,
					},
				);
			}
			const body = cases.map(formatCaseLine).join("\n");
			return void reply.components(interaction, [
				container(Accent.info, [text(t(titleKey, { user: target.tag })), text(body)]),
			]);
		}
		case "removewarn": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const caseNumber = interaction.options.getInteger("case", true);
			const removed = await deactivateCase(guild.id, caseNumber);
			if (!removed)
				return void reply.error(
					interaction,
					t("moderation:removewarn.notFound", { case: caseNumber }),
				);
			return ok(interaction, "moderation:removewarn.success", { case: caseNumber });
		}
		case "note": {
			if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers))
				return denyNoPerm(interaction);
			const target = interaction.options.getUser("user", true);
			const res = await addNote({
				guildId: guild.id,
				targetId: target.id,
				moderatorId: moderator.id,
				reason: interaction.options.getString("note", true),
			});
			if (!res.ok) return void reply.error(interaction, t(res.messageKey, res.vars));
			return ok(interaction, "moderation:success.note", {
				user: target.tag,
				case: res.caseNumber ?? 0,
			});
		}
		case "purge": {
			if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages)) return denyNoPerm(interaction);
			const count = interaction.options.getInteger("count", true);
			const channel = interaction.channel;
			if (!channel || !channel.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("moderation:error.badChannel"));
			}
			const deleted = await (channel as TextChannel).bulkDelete(count, true).catch(() => null);
			if (!deleted) return void reply.error(interaction, t("moderation:error.actionFailed"));
			return ok(interaction, "moderation:purge.success", { count: deleted.size });
		}
		case "slowmode": {
			if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels)) return denyNoPerm(interaction);
			const seconds = interaction.options.getInteger("seconds", true);
			const channel = interaction.channel;
			if (!channel || !("setRateLimitPerUser" in channel)) {
				return void reply.error(interaction, t("moderation:error.badChannel"));
			}
			await (channel as TextChannel).setRateLimitPerUser(seconds);
			return ok(interaction, "moderation:slowmode.success", { seconds });
		}
		case "lock":
		case "unlock": {
			if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels)) return denyNoPerm(interaction);
			const channel = interaction.channel;
			if (!channel || !("permissionOverwrites" in channel)) {
				return void reply.error(interaction, t("moderation:error.badChannel"));
			}
			const locking = sub === "lock";
			await (channel as TextChannel).permissionOverwrites.edit(guild.roles.everyone, {
				SendMessages: locking ? false : null,
			});
			return ok(interaction, locking ? "moderation:lock.success" : "moderation:unlock.success", {});
		}
		case "nick": {
			if (!hasPerm(interaction, PermissionFlagsBits.ManageNicknames))
				return denyNoPerm(interaction);
			const target = resolveMember();
			if (!target) return void reply.error(interaction, t("moderation:error.userNotInServer"));
			const nickname = interaction.options.getString("nickname");
			await target.setNickname(nickname ?? null).catch(() => null);
			return ok(interaction, "moderation:nick.success", { user: target.user.tag });
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const modCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const moderation: BotModule = {
	name: "moderation",
	commands: [modCommand],
	i18n: {
		"success.ban": "🔨 Banned **{user}** • Case #{case}",
		"success.unban": "♻️ Unbanned `{user}` • Case #{case}",
		"success.kick": "👢 Kicked **{user}** • Case #{case}",
		"success.timeout": "⏳ Timed out **{user}** for `{duration}` • Case #{case}",
		"success.untimeout": "✅ Removed timeout from **{user}**",
		"success.warn": "⚠️ Warned **{user}** • Case #{case}",
		"success.note": "📝 Note added for **{user}** • Case #{case}",
		"purge.success": "🧹 Deleted **{count}** messages.",
		"slowmode.success": "🐌 Slowmode set to **{seconds}s**.",
		"lock.success": "🔒 Channel locked.",
		"unlock.success": "🔓 Channel unlocked.",
		"nick.success": "✏️ Updated nickname for **{user}**.",
		"warnings.title": "# Warnings for {user}",
		"warnings.none": "**{user}** has no warnings.",
		"cases.title": "# Moderation history for {user}",
		"cases.none": "**{user}** has no moderation history.",
		"removewarn.success": "🗑️ Removed case #{case}.",
		"removewarn.notFound": "No case #{case} found.",
		"error.targetHigher": "You can't moderate a member with an equal or higher role.",
		"error.botTargetHigher": "I can't moderate a member with an equal or higher role than me.",
		"error.botNotInGuild": "I'm not a member of this server.",
		"error.actionFailed": "That action failed — check my permissions and role position.",
		"error.notBanned": "That user is not banned.",
		"error.notKickable": "I can't kick that member.",
		"error.notModeratable": "I can't moderate that member.",
		"error.notTimedOut": "That member is not timed out.",
		"error.userNotInServer": "That user is not in this server.",
		"error.invalidDuration": "Invalid duration. Use formats like `10m`, `1h`, `2d` (max 28d).",
		"error.badChannel": "This can't be used in this channel.",
	},
};

export default moderation;
