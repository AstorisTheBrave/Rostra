import { MessageFlags } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, text } from "@/utils/components.ts";
import { formatMessage, getConfig, type MessageContext } from "./service.ts";

export const welcomeEvents: RegisteredEvent[] = [
	defineEvent("guildMemberAdd", {
		execute: async (_c, member) => {
			const config = await getConfig(member.guild.id);
			if (!config) return;
			const ctx: MessageContext = {
				user: `<@${member.id}>`,
				username: member.user.username,
				server: member.guild.name,
				memberCount: member.guild.memberCount,
			};

			if (config.autoroleIds.length) {
				await member.roles.add(config.autoroleIds, "Autorole on join").catch(() => {});
			}

			if (config.welcomeEnabled && config.welcomeChannelId) {
				const channel = await member.guild.channels
					.fetch(config.welcomeChannelId)
					.catch(() => null);
				if (channel?.isTextBased()) {
					await channel
						.send({
							components: [
								container(Accent.success, [text(formatMessage(config.welcomeMessage, ctx))]),
							],
							flags: MessageFlags.IsComponentsV2,
						})
						.catch(() => {});
				}
			}

			if (config.dmEnabled && config.dmMessage) {
				await member
					.send({
						components: [container(Accent.info, [text(formatMessage(config.dmMessage, ctx))])],
						flags: MessageFlags.IsComponentsV2,
					})
					.catch(() => {});
			}
		},
	}),
	defineEvent("guildMemberRemove", {
		execute: async (_c, member) => {
			const config = await getConfig(member.guild.id);
			if (!config?.goodbyeEnabled || !config.goodbyeChannelId) return;
			const channel = await member.guild.channels.fetch(config.goodbyeChannelId).catch(() => null);
			if (!channel?.isTextBased()) return;
			const ctx: MessageContext = {
				user: `<@${member.id}>`,
				username: member.user?.username ?? "Someone",
				server: member.guild.name,
				memberCount: member.guild.memberCount,
			};
			await channel
				.send({
					components: [container(Accent.warn, [text(formatMessage(config.goodbyeMessage, ctx))])],
					flags: MessageFlags.IsComponentsV2,
				})
				.catch(() => {});
		},
	}),
];
