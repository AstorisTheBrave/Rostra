import { ChannelType, PermissionFlagsBits } from "discord.js";
import { defineEvent } from "@/client/defineEvent.ts";
import type { RegisteredEvent } from "@/types/module.ts";
import { formatName, getConfig, isTemp, recordTemp, removeTemp } from "./service.ts";

export const j2cEvents: RegisteredEvent[] = [
	defineEvent("voiceStateUpdate", {
		execute: async (_c, oldState, newState) => {
			const guild = newState.guild;

			// Left a channel that may be an empty temp channel → clean it up.
			if (oldState.channelId && oldState.channelId !== newState.channelId) {
				const channel = oldState.channel;
				if (channel && channel.members.size === 0 && (await isTemp(channel.id))) {
					await channel.delete("Join-to-create channel empty").catch(() => {});
					await removeTemp(channel.id);
				}
			}

			// Joined the hub channel → create a personal temp channel and move them in.
			const config = await getConfig(guild.id);
			if (!config?.hubChannelId || newState.channelId !== config.hubChannelId) return;
			const member = newState.member;
			if (!member) return;

			const created = await guild.channels
				.create({
					name: formatName(config.nameTemplate, member.user.username),
					type: ChannelType.GuildVoice,
					parent: config.categoryId ?? newState.channel?.parentId ?? null,
					userLimit: config.userLimit || undefined,
					permissionOverwrites: [
						{
							id: member.id,
							allow: [
								PermissionFlagsBits.ManageChannels,
								PermissionFlagsBits.MoveMembers,
								PermissionFlagsBits.MuteMembers,
								PermissionFlagsBits.DeafenMembers,
							],
						},
					],
				})
				.catch(() => null);
			if (!created) return;

			await recordTemp(created.id, guild.id, member.id);
			await member.voice.setChannel(created).catch(async () => {
				await created.delete().catch(() => {});
				await removeTemp(created.id);
			});
		},
	}),
];
