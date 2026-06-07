import {
	AttachmentBuilder,
	type ChatInputCommandInteraction,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, gallery, reply, text } from "@/ui";
import { renderRankCard } from "./card.ts";
import { levelingEvents } from "./events.ts";
import {
	getRewards,
	getUser,
	leaderboard,
	levelProgress,
	rankPosition,
	removeReward,
	setLevel,
	setReward,
	upsertConfig,
} from "./service.ts";

const DEFAULT_ACCENT = "#5865f2";

async function showRankCard(interaction: ChatInputCommandInteraction, gid: string): Promise<void> {
	const user = interaction.options.getUser("user") ?? interaction.user;
	const [account, rank] = await Promise.all([getUser(gid, user.id), rankPosition(gid, user.id)]);
	const p = levelProgress(account.xp);
	const buffer = await renderRankCard({
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
		accent: DEFAULT_ACCENT,
		level: p.level,
		rank,
		xp: account.xp,
		into: p.into,
		needed: p.needed,
	});
	const file = new AttachmentBuilder(buffer, { name: "rank.png" });
	const payload = {
		components: [container(Accent.info, [gallery(["attachment://rank.png"])])],
		files: [file],
		flags: MessageFlags.IsComponentsV2,
	};
	if (interaction.deferred || interaction.replied) {
		await interaction.editReply(payload as unknown as InteractionEditReplyOptions);
	} else {
		await interaction.reply(payload as unknown as InteractionReplyOptions);
	}
}

function isManager(interaction: ChatInputCommandInteraction): boolean {
	return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("level").setDescription("Leveling and XP");
	cmd.addSubcommand((s) =>
		s
			.setName("rank")
			.setDescription("Show a member's rank")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Top members by XP"));
	cmd.addSubcommand((s) => s.setName("enable").setDescription("Enable leveling (Manage Server)"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable leveling (Manage Server)"));
	cmd.addSubcommand((s) =>
		s
			.setName("announcechannel")
			.setDescription("Channel for level-up messages (Manage Server)")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set a member's level (Manage Server)")
			.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
			.addIntegerOption((o) =>
				o
					.setName("level")
					.setDescription("Level")
					.setRequired(true)
					.setMinValue(0)
					.setMaxValue(1000),
			),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("reward")
			.setDescription("Role rewards per level (Manage Server)")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add a role reward")
					.addIntegerOption((o) =>
						o.setName("level").setDescription("Level").setRequired(true).setMinValue(1),
					)
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a role reward")
					.addIntegerOption((o) =>
						o.setName("level").setDescription("Level").setRequired(true).setMinValue(1),
					),
			)
			.addSubcommand((s) => s.setName("list").setDescription("List role rewards")),
	);
	return cmd;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	message: string,
	accent: number = Accent.success,
): Promise<void> {
	await reply.components(interaction, [container(accent, [text(message)])]);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const gid = guild.id;
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === "reward") {
		if (sub !== "list" && !isManager(interaction)) {
			return void reply.error(interaction, t("common:error.missingPermissions"));
		}
		if (sub === "add") {
			const level = interaction.options.getInteger("level", true);
			const role = interaction.options.getRole("role", true);
			await setReward(gid, level, role.id);
			return ok(interaction, t("leveling:reward.add", { level, role: role.name }));
		}
		if (sub === "remove") {
			const level = interaction.options.getInteger("level", true);
			const removed = await removeReward(gid, level);
			return removed
				? ok(interaction, t("leveling:reward.remove", { level }))
				: void reply.error(interaction, t("leveling:reward.notFound", { level }));
		}
		const rewards = await getRewards(gid);
		if (rewards.length === 0) return ok(interaction, t("leveling:reward.empty"), Accent.info);
		const lines = rewards.map((r) => `Level **${r.level}** → <@&${r.roleId}>`);
		return void reply.components(interaction, [
			container(Accent.info, [text(t("leveling:reward.title")), text(lines.join("\n"))]),
		]);
	}

	switch (sub) {
		case "rank":
			return void showRankCard(interaction, gid);
		case "leaderboard": {
			const top = await leaderboard(gid, 10);
			if (top.length === 0) return ok(interaction, t("leveling:leaderboard.empty"), Accent.info);
			const medals = ["🥇", "🥈", "🥉"];
			const lines = top.map(
				(e, i) =>
					`${medals[i] ?? `\`#${i + 1}\``} <@${e.userId}> - level **${e.level}** (${e.xp.toLocaleString("en-US")} XP)`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("leveling:leaderboard.title")), text(lines.join("\n"))]),
			]);
		}
		case "enable":
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			await upsertConfig(gid, { enabled: true });
			return ok(interaction, t("leveling:enabled"));
		case "disable":
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			await upsertConfig(gid, { enabled: false });
			return ok(interaction, t("leveling:disabled"));
		case "announcechannel": {
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(gid, { announceChannelId: channel.id });
			return ok(interaction, t("leveling:announce.set", { channel: `<#${channel.id}>` }));
		}
		case "set": {
			if (!isManager(interaction))
				return void reply.error(interaction, t("common:error.missingPermissions"));
			const user = interaction.options.getUser("user", true);
			const level = interaction.options.getInteger("level", true);
			await setLevel(gid, user.id, level);
			return ok(interaction, t("leveling:set", { user: user.username, level }));
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const levelCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const leveling: BotModule = {
	name: "leveling",
	commands: [levelCommand],
	events: levelingEvents,
	i18n: {
		enabled: "📈 Leveling **enabled**.",
		disabled: "📈 Leveling **disabled**.",
		"announce.set": "📢 Level-up announcements will go to {channel}.",
		set: "✅ Set **{user}** to level **{level}**.",
		"reward.add": "🎁 Members reaching level **{level}** will get **{role}**.",
		"reward.remove": "➖ Removed the reward for level **{level}**.",
		"reward.notFound": "No reward set for level **{level}**.",
		"reward.title": "# 🎁 Level rewards",
		"reward.empty": "No role rewards configured.",
		"leaderboard.title": "# 🏆 XP leaderboard",
		"leaderboard.empty": "No XP earned yet.",
	},
};

export default leveling;
