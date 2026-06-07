import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { starboardEvents } from "./events.ts";
import { emojiDisplay, getConfig, parseStarEmoji, topStarred, upsertConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("starboard")
		.setDescription("Highlight your server's best messages")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("channel")
			.setDescription("Set the starboard channel")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("threshold")
			.setDescription("Stars needed to reach the starboard")
			.addIntegerOption((o) =>
				o.setName("count").setDescription("Required stars").setRequired(true).setMinValue(1),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("emoji")
			.setDescription("Set the star emoji")
			.addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("selfstar")
			.setDescription("Allow members to star their own messages")
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("ignorebots")
			.setDescription("Ignore stars from bots")
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("ignore")
			.setDescription("Ignore (or un-ignore) a channel")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("removethreshold")
			.setDescription("Stars a post may drop to before it is removed (0 = same as threshold)")
			.addIntegerOption((o) =>
				o
					.setName("count")
					.setDescription("Removal floor (0 to disable)")
					.setRequired(true)
					.setMinValue(0),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("reward")
			.setDescription("Grant a role when one of a member's messages hits a star milestone")
			.addIntegerOption((o) =>
				o
					.setName("stars")
					.setDescription("Stars on a single message to earn the role (0 to disable)")
					.setRequired(true)
					.setMinValue(0),
			)
			.addRoleOption((o) => o.setName("role").setDescription("Role to grant")),
	);
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show starboard settings"));
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Top star earners"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Turn the starboard off"));
	return cmd;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	key: string,
	vars: Record<string, string | number> = {},
): Promise<void> {
	await reply.success(interaction, t(key, vars), true);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "channel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { channelId: channel.id });
			return ok(interaction, "starboard:channelSet", { channel: `<#${channel.id}>` });
		}
		case "threshold": {
			const count = interaction.options.getInteger("count", true);
			await upsertConfig(guild.id, { threshold: count });
			return ok(interaction, "starboard:thresholdSet", { count });
		}
		case "emoji": {
			const raw = interaction.options.getString("emoji", true);
			const stored = parseStarEmoji(raw);
			await upsertConfig(guild.id, { emoji: stored });
			return ok(interaction, "starboard:emojiSet", { emoji: emojiDisplay(stored) });
		}
		case "selfstar": {
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { selfStar: enabled });
			return ok(interaction, enabled ? "starboard:selfOn" : "starboard:selfOff");
		}
		case "ignorebots": {
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { ignoreBots: enabled });
			return ok(interaction, enabled ? "starboard:botsIgnored" : "starboard:botsCounted");
		}
		case "ignore": {
			const channel = interaction.options.getChannel("channel", true);
			const config = await getConfig(guild.id);
			const list = config?.ignoredChannels ?? [];
			const isIgnored = list.includes(channel.id);
			const next = isIgnored ? list.filter((c) => c !== channel.id) : [...list, channel.id];
			await upsertConfig(guild.id, { ignoredChannels: next });
			return ok(interaction, isIgnored ? "starboard:unignored" : "starboard:ignored", {
				channel: `<#${channel.id}>`,
			});
		}
		case "removethreshold": {
			const count = interaction.options.getInteger("count", true);
			await upsertConfig(guild.id, { removeThreshold: count === 0 ? null : count });
			return count === 0
				? ok(interaction, "starboard:removeOff")
				: ok(interaction, "starboard:removeSet", { count });
		}
		case "reward": {
			const stars = interaction.options.getInteger("stars", true);
			const role = interaction.options.getRole("role");
			if (stars === 0) {
				await upsertConfig(guild.id, { rewardStars: 0, rewardRoleId: null });
				return ok(interaction, "starboard:rewardOff");
			}
			if (!role) return void reply.error(interaction, t("starboard:rewardNeedsRole"));
			await upsertConfig(guild.id, { rewardStars: stars, rewardRoleId: role.id });
			return ok(interaction, "starboard:rewardSet", { role: `<@&${role.id}>`, stars });
		}
		case "disable": {
			await upsertConfig(guild.id, { channelId: null });
			return ok(interaction, "starboard:disabled");
		}
		case "status": {
			const config = await getConfig(guild.id);
			const lines = [
				t("starboard:status.channel", {
					channel: config?.channelId ? `<#${config.channelId}>` : "—",
				}),
				t("starboard:status.threshold", { count: config?.threshold ?? 3 }),
				t("starboard:status.emoji", { emoji: emojiDisplay(config?.emoji ?? "⭐") }),
				t("starboard:status.selfstar", { state: config?.selfStar ? "on" : "off" }),
				t("starboard:status.remove", {
					count: config?.removeThreshold ? String(config.removeThreshold) : "off",
				}),
				t("starboard:status.reward", {
					reward:
						config?.rewardStars && config.rewardRoleId
							? `<@&${config.rewardRoleId}> at ${config.rewardStars}⭐`
							: "off",
				}),
			];
			return void reply.components(interaction, [
				container(Accent.warn, [text(t("starboard:status.title")), text(lines.join("\n"))]),
			]);
		}
		case "leaderboard": {
			const top = await topStarred(guild.id, 10);
			if (top.length === 0) {
				return void reply.components(interaction, [
					container(Accent.warn, [text(t("starboard:lb.empty"))]),
				]);
			}
			const lines = top.map((r, i) => `**${i + 1}.** <@${r.authorId}> - ⭐ ${r.stars}`);
			return void reply.components(interaction, [
				container(Accent.warn, [text(t("starboard:lb.title")), text(lines.join("\n"))]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const starboardCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const starboard: BotModule = {
	name: "starboard",
	commands: [starboardCommand],
	events: starboardEvents,
	i18n: {
		channelSet: "⭐ Starboard channel set to {channel}.",
		thresholdSet: "⭐ Messages now need **{count}** stars to reach the starboard.",
		emojiSet: "⭐ Star emoji set to {emoji}.",
		selfOn: "⭐ Members can now star their own messages.",
		selfOff: "⭐ Members can no longer star their own messages.",
		botsIgnored: "⭐ Bot stars are now ignored.",
		botsCounted: "⭐ Bot stars now count.",
		ignored: "🙈 Now ignoring {channel} for the starboard.",
		unignored: "👀 No longer ignoring {channel}.",
		removeSet: "⭐ Posts now stay until they drop below **{count}** stars.",
		removeOff: "⭐ Removal floor cleared (posts drop at the main threshold).",
		rewardSet: "🏅 {role} will be granted when a message hits **{stars}** stars.",
		rewardOff: "🏅 Star reward role disabled.",
		rewardNeedsRole: "Pick a role to grant, or set stars to 0 to disable the reward.",
		disabled: "⭐ Starboard turned off.",
		"status.title": "# ⭐ Starboard settings",
		"status.channel": "Channel: {channel}",
		"status.threshold": "Required stars: **{count}**",
		"status.emoji": "Emoji: {emoji}",
		"status.selfstar": "Self-stars: **{state}**",
		"status.remove": "Removal floor: **{count}**",
		"status.reward": "Star reward: **{reward}**",
		"lb.title": "# ⭐ Starboard leaderboard",
		"lb.empty": "No starred messages yet.",
	},
};

export default starboard;
