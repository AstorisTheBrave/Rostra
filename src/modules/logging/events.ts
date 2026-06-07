import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { isIgnored, sendLog, truncate } from "./service.ts";

export const loggingEvents: RegisteredEvent[] = [
	defineEvent("messageDelete", {
		execute: async (_c, message) => {
			if (!message.guild || message.author?.bot) return;
			if (await isIgnored(message.guild.id, message.channelId)) return;
			await sendLog(message.guild, "messageDelete", () =>
				container(Accent.error, [
					text("## 🗑️ Message deleted"),
					text(
						`**Author:** ${message.author?.tag ?? "Unknown"}\n**Channel:** <#${message.channelId}>\n**Content:** ${truncate(message.content ?? "-")}`,
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
		execute: (_c, member) =>
			sendLog(member.guild, "memberLeave", () =>
				container(Accent.warn, [
					text("## 📤 Member left"),
					text(`${member.user.tag} (\`${member.id}\`)`),
				]),
			),
	}),
	defineEvent("guildBanAdd", {
		execute: (_c, ban) =>
			sendLog(ban.guild, "memberBan", () =>
				container(Accent.error, [
					text("## 🔨 Member banned"),
					text(`${ban.user.tag} (\`${ban.user.id}\`)`),
				]),
			),
	}),
	defineEvent("guildBanRemove", {
		execute: (_c, ban) =>
			sendLog(ban.guild, "memberUnban", () =>
				container(Accent.success, [
					text("## ♻️ Member unbanned"),
					text(`${ban.user.tag} (\`${ban.user.id}\`)`),
				]),
			),
	}),
	defineEvent("roleCreate", {
		execute: (_c, role) =>
			sendLog(role.guild, "roleChanges", () =>
				container(Accent.success, [
					text("## ➕ Role created"),
					text(`**${role.name}** (\`${role.id}\`)`),
				]),
			),
	}),
	defineEvent("roleDelete", {
		execute: (_c, role) =>
			sendLog(role.guild, "roleChanges", () =>
				container(Accent.error, [
					text("## ➖ Role deleted"),
					text(`**${role.name}** (\`${role.id}\`)`),
				]),
			),
	}),
	defineEvent("channelCreate", {
		execute: (_c, channel) =>
			sendLog(channel.guild, "channelChanges", () =>
				container(Accent.success, [
					text("## ➕ Channel created"),
					text(`<#${channel.id}> (\`${channel.id}\`)`),
				]),
			),
	}),
	defineEvent("channelDelete", {
		execute: (_c, channel) => {
			if (!("guild" in channel)) return;
			return sendLog(channel.guild, "channelChanges", () =>
				container(Accent.error, [
					text("## ➖ Channel deleted"),
					text(`**${channel.name}** (\`${channel.id}\`)`),
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
		execute: (_c, oldMember, newMember) => {
			if (oldMember.nickname === newMember.nickname) return;
			return sendLog(newMember.guild, "nicknameChanges", () =>
				container(Accent.info, [
					text("## 🏷️ Nickname changed"),
					text(
						`${newMember.user.tag} (\`${newMember.id}\`)\n**Before:** ${oldMember.nickname ?? "*none*"}\n**After:** ${newMember.nickname ?? "*none*"}`,
					),
				]),
			);
		},
	}),
];
