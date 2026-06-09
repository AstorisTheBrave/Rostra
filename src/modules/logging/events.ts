import { AuditLogEvent } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { auditActor, isIgnored, sendLog, truncate } from "./service.ts";

export const loggingEvents: RegisteredEvent[] = [
	defineEvent("messageDelete", {
		execute: async (_c, message) => {
			if (!message.guild || message.author?.bot) return;
			if (await isIgnored(message.guild.id, message.channelId)) return;
			const by = await auditActor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
			await sendLog(message.guild, "messageDelete", () =>
				container(Accent.error, [
					text("## 🗑️ Message deleted"),
					text(
						`**Author:** ${message.author?.tag ?? "Unknown"}\n**Channel:** <#${message.channelId}>\n**Content:** ${truncate(message.content ?? "-")}${by}`,
					),
				]),
			);
		},
	}),
	defineEvent("messageUpdate", {
		execute: async (_c, oldMessage, newMessage) => {
			if (!newMessage.guild || newMessage.author?.bot) return;
			if (oldMessage.content === newMessage.content) return;
			if (await isIgnored(newMessage.guild.id, newMessage.channelId)) return;
			await sendLog(newMessage.guild, "messageEdit", () =>
				container(Accent.warn, [
					text("## ✏️ Message edited"),
					text(
						`**Author:** ${newMessage.author?.tag ?? "Unknown"}\n**Channel:** <#${newMessage.channelId}>\n**Before:** ${truncate(oldMessage.content ?? "-", 400)}\n**After:** ${truncate(newMessage.content ?? "-", 400)}`,
					),
				]),
			);
		},
	}),
	defineEvent("guildMemberAdd", {
		execute: (_c, member) =>
			sendLog(member.guild, "memberJoin", () =>
				container(Accent.success, [
					text("## 📥 Member joined"),
					text(
						`${member.user.tag} (\`${member.id}\`)\nAccount created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
					),
				]),
			),
	}),
	defineEvent("guildMemberRemove", {
		execute: async (_c, member) => {
			// A removal is either a voluntary leave or a kick; the audit log tells them apart.
			const by = await auditActor(member.guild, AuditLogEvent.MemberKick, member.id);
			if (by) {
				return sendLog(member.guild, "memberLeave", () =>
					container(Accent.error, [
						text("## 👢 Member kicked"),
						text(`${member.user.tag} (\`${member.id}\`)${by}`),
					]),
				);
			}
			return sendLog(member.guild, "memberLeave", () =>
				container(Accent.warn, [
					text("## 📤 Member left"),
					text(`${member.user.tag} (\`${member.id}\`)`),
				]),
			);
		},
	}),
	defineEvent("guildBanAdd", {
		execute: async (_c, ban) => {
			const by = await auditActor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
			await sendLog(ban.guild, "memberBan", () =>
				container(Accent.error, [
					text("## 🔨 Member banned"),
					text(
						`${ban.user.tag} (\`${ban.user.id}\`)${by}${ban.reason ? `\n**Reason:** ${ban.reason}` : ""}`,
					),
				]),
			);
		},
	}),
	defineEvent("guildBanRemove", {
		execute: async (_c, ban) => {
			const by = await auditActor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
			await sendLog(ban.guild, "memberUnban", () =>
				container(Accent.success, [
					text("## ♻️ Member unbanned"),
					text(`${ban.user.tag} (\`${ban.user.id}\`)${by}`),
				]),
			);
		},
	}),
	defineEvent("roleCreate", {
		execute: async (_c, role) => {
			const by = await auditActor(role.guild, AuditLogEvent.RoleCreate, role.id);
			await sendLog(role.guild, "roleChanges", () =>
				container(Accent.success, [
					text("## ➕ Role created"),
					text(`**${role.name}** (\`${role.id}\`)${by}`),
				]),
			);
		},
	}),
	defineEvent("roleDelete", {
		execute: async (_c, role) => {
			const by = await auditActor(role.guild, AuditLogEvent.RoleDelete, role.id);
			await sendLog(role.guild, "roleChanges", () =>
				container(Accent.error, [
					text("## ➖ Role deleted"),
					text(`**${role.name}** (\`${role.id}\`)${by}`),
				]),
			);
		},
	}),
	defineEvent("channelCreate", {
		execute: async (_c, channel) => {
			const by = await auditActor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
			await sendLog(channel.guild, "channelChanges", () =>
				container(Accent.success, [
					text("## ➕ Channel created"),
					text(`<#${channel.id}> (\`${channel.id}\`)${by}`),
				]),
			);
		},
	}),
	defineEvent("channelDelete", {
		execute: async (_c, channel) => {
			if (!("guild" in channel)) return;
			const by = await auditActor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
			await sendLog(channel.guild, "channelChanges", () =>
				container(Accent.error, [
					text("## ➖ Channel deleted"),
					text(`**${channel.name}** (\`${channel.id}\`)${by}`),
				]),
			);
		},
	}),
	defineEvent("messageDeleteBulk", {
		execute: async (_c, messages) => {
			const first = messages.first();
			const guild = first?.guild;
			if (!guild) return;
			if (await isIgnored(guild.id, first.channelId)) return;
			await sendLog(guild, "bulkDelete", () =>
				container(Accent.error, [
					text("## 🧹 Bulk delete"),
					text(`**${messages.size}** messages deleted in <#${first.channelId}>.`),
				]),
			);
		},
	}),
	defineEvent("voiceStateUpdate", {
		execute: (_c, oldState, newState) => {
			const guild = newState.guild;
			const member = newState.member;
			if (!member || member.user.bot) return;
			const who = `${member.user.tag} (\`${member.id}\`)`;
			if (!oldState.channelId && newState.channelId) {
				return sendLog(guild, "voiceMoves", () =>
					container(Accent.success, [
						text("## 🔊 Joined voice"),
						text(`${who}\n**Channel:** <#${newState.channelId}>`),
					]),
				);
			}
			if (oldState.channelId && !newState.channelId) {
				return sendLog(guild, "voiceMoves", () =>
					container(Accent.warn, [
						text("## 🔇 Left voice"),
						text(`${who}\n**Channel:** <#${oldState.channelId}>`),
					]),
				);
			}
			if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
				return sendLog(guild, "voiceMoves", () =>
					container(Accent.info, [
						text("## 🔁 Moved voice"),
						text(`${who}\n<#${oldState.channelId}> → <#${newState.channelId}>`),
					]),
				);
			}
		},
	}),
	defineEvent("guildMemberUpdate", {
		execute: async (_c, oldMember, newMember) => {
			// Role add/remove (mirrors Discord's "Roles updated" audit entry).
			const before = oldMember.roles.cache;
			const after = newMember.roles.cache;
			const added = after.filter((r) => !before.has(r.id));
			const removed = before.filter((r) => !after.has(r.id));
			if (added.size || removed.size) {
				const by = await auditActor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
				const lines = [
					added.size ? `**Added:** ${added.map((r) => `<@&${r.id}>`).join(", ")}` : "",
					removed.size ? `**Removed:** ${removed.map((r) => `<@&${r.id}>`).join(", ")}` : "",
				]
					.filter(Boolean)
					.join("\n");
				await sendLog(newMember.guild, "roleChanges", () =>
					container(Accent.info, [
						text("## 🎭 Member roles updated"),
						text(`${newMember.user.tag} (\`${newMember.id}\`)\n${lines}${by}`),
					]),
				);
			}
			// Nickname change.
			if (oldMember.nickname !== newMember.nickname) {
				await sendLog(newMember.guild, "nicknameChanges", () =>
					container(Accent.info, [
						text("## 🏷️ Nickname changed"),
						text(
							`${newMember.user.tag} (\`${newMember.id}\`)\n**Before:** ${oldMember.nickname ?? "*none*"}\n**After:** ${newMember.nickname ?? "*none*"}`,
						),
					]),
				);
			}
		},
	}),
];
