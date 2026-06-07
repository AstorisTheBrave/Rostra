import { AttachmentBuilder, MessageFlags } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { Accent, container, gallery, text } from "@/ui";
import { renderWelcomeCard } from "./card.ts";
import { formatMessage, getConfig, type MessageContext } from "./service.ts";

export const welcomeEvents: RegisteredEvent[] = [
	defineEvent("guildMemberAdd", {
		execute: async (_c, member) => {
			if (await isFeatureBlocked(member.guild.id, "welcome")) return;
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
					const body: Array<ReturnType<typeof text> | ReturnType<typeof gallery>> = [
						text(formatMessage(config.welcomeMessage, ctx)),
					];
					const files: AttachmentBuilder[] = [];
					if (config.welcomeCard) {
						const buffer = await renderWelcomeCard({
							username: member.user.username,
							avatarUrl: member.user.displayAvatarURL({ extension: "png", size: 256 }),
							serverName: member.guild.name,
							memberCount: member.guild.memberCount,
						}).catch(() => null);
						if (buffer) {
							files.push(new AttachmentBuilder(buffer, { name: "welcome.png" }));
							body.push(gallery(["attachment://welcome.png"]));
						}
					}
					await channel
						.send({
							components: [container(Accent.success, body)],
							files,
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
			if (await isFeatureBlocked(member.guild.id, "welcome")) return;
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
