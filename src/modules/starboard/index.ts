import type { Starboard } from "@prisma/client";
import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { setFeatures } from "@/services/tenant.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { parseDisplayTiers } from "./eligibility.ts";
import { starboardEvents } from "./events.ts";
import {
	addAutostar,
	createBoard,
	createOverride,
	deleteBoard,
	deleteOverride,
	emojiDisplay,
	getBoard,
	listAutostar,
	listBoards,
	parseEmojiList,
	removeAutostar,
	topStarred,
	updateBoard,
	updateOverride,
} from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("starboard")
		.setDescription("Highlight your server's best messages (multiple boards)")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) =>
		s
			.setName("create")
			.setDescription("Create a starboard")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Where to post").setRequired(true),
			)
			.addStringOption((o) =>
				o.setName("emojis").setDescription("Star emojis (space separated, default ⭐)"),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("delete")
			.setDescription("Delete a starboard")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List this server's starboards"));
	cmd.addSubcommand((s) =>
		s
			.setName("edit")
			.setDescription("Change a starboard's settings")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
			.addIntegerOption((o) =>
				o.setName("required_stars").setDescription("Stars to post").setMinValue(1),
			)
			.addIntegerOption((o) =>
				o
					.setName("remove_stars")
					.setDescription("Stars to drop below before removing")
					.setMinValue(0),
			)
			.addStringOption((o) => o.setName("emojis").setDescription("Star emojis (space separated)"))
			.addBooleanOption((o) => o.setName("self_star").setDescription("Allow self-stars"))
			.addBooleanOption((o) => o.setName("filter_bots").setDescription("Ignore bots"))
			.addBooleanOption((o) =>
				o.setName("sync_deletes").setDescription("Remove post if original deleted"),
			)
			.addRoleOption((o) =>
				o.setName("reward_role").setDescription("Reward role at a star milestone"),
			)
			.addIntegerOption((o) =>
				o
					.setName("reward_stars")
					.setDescription("Stars to earn the reward role (0 = off)")
					.setMinValue(0),
			)
			.addRoleOption((o) =>
				o.setName("author_role").setDescription("Only accept messages by authors with this role"),
			)
			.addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable the board"))
			.addStringOption((o) =>
				o.setName("downvote_emojis").setDescription("Emojis that subtract stars (space separated)"),
			)
			.addBooleanOption((o) =>
				o.setName("remove_invalid").setDescription("Strip reactions that are not valid stars"),
			)
			.addIntegerOption((o) =>
				o.setName("min_chars").setDescription("Minimum message length").setMinValue(0),
			)
			.addIntegerOption((o) =>
				o.setName("min_attachments").setDescription("Minimum attachments").setMinValue(0),
			)
			.addBooleanOption((o) =>
				o.setName("require_image").setDescription("Require an image/attachment"),
			)
			.addIntegerOption((o) =>
				o
					.setName("max_age_hours")
					.setDescription("Only star messages newer than N hours (0 = off)")
					.setMinValue(0),
			)
			.addBooleanOption((o) =>
				o.setName("require_nsfw").setDescription("Only star messages from age-restricted channels"),
			)
			.addStringOption((o) =>
				o.setName("display_tiers").setDescription('Tiers e.g. "5:⭐ 10:🌟 25:💫" (empty to clear)'),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("block")
			.setDescription("Toggle a role/channel/user on a board's blacklist")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
			.addRoleOption((o) => o.setName("role").setDescription("Role"))
			.addChannelOption((o) => o.setName("channel").setDescription("Channel"))
			.addUserOption((o) => o.setName("user").setDescription("User")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("allow")
			.setDescription("Toggle a role/channel/user on a board's whitelist (beats blacklist)")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
			.addRoleOption((o) => o.setName("role").setDescription("Role"))
			.addChannelOption((o) => o.setName("channel").setDescription("Channel"))
			.addUserOption((o) => o.setName("user").setDescription("User")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("ignore")
			.setDescription("Toggle a channel in a board's ignore list")
			.addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Top star earners"));
	cmd.addSubcommandGroup((g) =>
		g
			.setName("autostar")
			.setDescription("Channels the bot auto-reacts to with star emojis")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add an auto-star channel")
					.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true))
					.addStringOption((o) =>
						o.setName("emojis").setDescription("Emojis to auto-react with (default ⭐)"),
					),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove an auto-star channel")
					.addChannelOption((o) =>
						o.setName("channel").setDescription("Channel").setRequired(true),
					),
			)
			.addSubcommand((s) => s.setName("list").setDescription("List auto-star channels")),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("override")
			.setDescription("Per-channel or per-role setting overrides for a board")
			.addSubcommand((s) =>
				s
					.setName("create")
					.setDescription("Create an override scoped to a channel or role")
					.addStringOption((o) => o.setName("board").setDescription("Board name").setRequired(true))
					.addStringOption((o) =>
						o.setName("name").setDescription("Override name").setRequired(true),
					)
					.addChannelOption((o) => o.setName("channel").setDescription("Scope: channel"))
					.addRoleOption((o) => o.setName("role").setDescription("Scope: role")),
			)
			.addSubcommand((s) =>
				s
					.setName("set")
					.setDescription("Set an override's settings (blank = inherit)")
					.addStringOption((o) => o.setName("board").setDescription("Board name").setRequired(true))
					.addStringOption((o) =>
						o.setName("name").setDescription("Override name").setRequired(true),
					)
					.addIntegerOption((o) =>
						o.setName("required_stars").setDescription("Required stars").setMinValue(1),
					)
					.addIntegerOption((o) =>
						o.setName("remove_stars").setDescription("Removal floor").setMinValue(0),
					)
					.addBooleanOption((o) => o.setName("self_star").setDescription("Allow self-stars"))
					.addBooleanOption((o) => o.setName("filter_bots").setDescription("Ignore bots"))
					.addBooleanOption((o) => o.setName("enabled").setDescription("Enable the override")),
			)
			.addSubcommand((s) =>
				s
					.setName("delete")
					.setDescription("Delete an override")
					.addStringOption((o) => o.setName("board").setDescription("Board name").setRequired(true))
					.addStringOption((o) =>
						o.setName("name").setDescription("Override name").setRequired(true),
					),
			),
	);
	return cmd;
}

async function ok(
	interaction: ChatInputCommandInteraction,
	key: string,
	vars: Record<string, string | number> = {},
	accent?: number,
): Promise<void> {
	if (accent !== undefined) {
		await reply.components(interaction, [container(accent, [text(t(key, vars))])]);
		return;
	}
	await reply.success(interaction, t(key, vars), true);
}

function boardSummary(b: Starboard): string {
	const emojis = b.emojis.map(emojiDisplay).join(" ");
	const extras = [
		`stars: **${b.requiredStars}**`,
		b.removeStars !== null ? `remove<${b.removeStars}` : null,
		b.selfStar ? "self-star" : null,
		b.rewardStars > 0 && b.rewardRoleId ? `reward <@&${b.rewardRoleId}>@${b.rewardStars}` : null,
		b.authorRoleId ? `author <@&${b.authorRoleId}>` : null,
		b.ignoredChannels.length ? `${b.ignoredChannels.length} ignored` : null,
		b.enabled ? null : "**disabled**",
	].filter(Boolean);
	return `**${b.name}** ${emojis} -> <#${b.channelId}>\n${extras.join(" · ")}`;
}

async function handleAutostar(
	interaction: ChatInputCommandInteraction,
	guildId: string,
	sub: string,
): Promise<void> {
	if (sub === "list") {
		const rows = await listAutostar(guildId);
		if (rows.length === 0) return ok(interaction, "starboard:autostar.empty");
		const lines = rows.map((r) => `<#${r.channelId}> - ${r.emojis.map(emojiDisplay).join(" ")}`);
		return void reply.components(interaction, [
			container(Accent.warn, [text(t("starboard:autostar.title")), text(lines.join("\n"))]),
		]);
	}
	const channel = interaction.options.getChannel("channel", true);
	if (sub === "add") {
		const emojis = parseEmojiList(interaction.options.getString("emojis") ?? "⭐");
		await addAutostar(guildId, channel.id, emojis.length ? emojis : ["⭐"]);
		return ok(interaction, "starboard:autostar.added", { channel: `<#${channel.id}>` });
	}
	const removed = await removeAutostar(guildId, channel.id);
	return removed
		? ok(interaction, "starboard:autostar.removed", { channel: `<#${channel.id}>` })
		: void reply.error(interaction, t("starboard:autostar.notFound"));
}

function toggle(list: string[], id: string): string[] {
	return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

async function handleOverride(
	interaction: ChatInputCommandInteraction,
	gid: string,
	sub: string,
): Promise<void> {
	const boardName = interaction.options.getString("board", true);
	const name = interaction.options.getString("name", true).slice(0, 40);
	const board = await getBoard(gid, boardName);
	if (!board) return void reply.error(interaction, t("starboard:notFound"));

	if (sub === "create") {
		const channel = interaction.options.getChannel("channel");
		const role = interaction.options.getRole("role");
		if (!channel && !role) return void reply.error(interaction, t("starboard:override.needScope"));
		try {
			await createOverride({
				starboardId: board.id,
				guildId: gid,
				name,
				scopeType: channel ? "channel" : "role",
				scopeIds: channel ? [channel.id] : [(role as { id: string }).id],
			});
		} catch {
			return void reply.error(interaction, t("starboard:override.exists"));
		}
		return ok(interaction, "starboard:override.created", { name, board: boardName });
	}
	if (sub === "delete") {
		const removed = await deleteOverride(gid, board.id, name);
		return removed
			? ok(interaction, "starboard:override.deleted", { name })
			: void reply.error(interaction, t("starboard:override.notFound"));
	}
	// set
	const patch: Record<string, number | boolean> = {};
	const rsq = interaction.options.getInteger("required_stars");
	if (rsq !== null) patch.requiredStars = rsq;
	const rms = interaction.options.getInteger("remove_stars");
	if (rms !== null) patch.removeStars = rms;
	const ssq = interaction.options.getBoolean("self_star");
	if (ssq !== null) patch.selfStar = ssq;
	const fbq = interaction.options.getBoolean("filter_bots");
	if (fbq !== null) patch.filterBots = fbq;
	const enq = interaction.options.getBoolean("enabled");
	if (enq !== null) patch.enabled = enq;
	const updated = await updateOverride(gid, board.id, name, patch);
	return updated
		? ok(interaction, "starboard:override.updated", { name })
		: void reply.error(interaction, t("starboard:override.notFound"));
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

	if (group === "autostar") return handleAutostar(interaction, gid, sub);
	if (group === "override") return handleOverride(interaction, gid, sub);

	switch (sub) {
		case "create": {
			const name = interaction.options.getString("name", true).slice(0, 40);
			const channel = interaction.options.getChannel("channel", true);
			const emojis = parseEmojiList(interaction.options.getString("emojis") ?? "⭐");
			if (await getBoard(gid, name)) return void reply.error(interaction, t("starboard:exists"));
			await createBoard({
				guildId: gid,
				name,
				channelId: channel.id,
				emojis: emojis.length ? emojis : ["⭐"],
			});
			await setFeatures(gid, { starboard: true });
			return ok(interaction, "starboard:created", { name, channel: `<#${channel.id}>` });
		}
		case "delete": {
			const name = interaction.options.getString("name", true);
			const removed = await deleteBoard(gid, name);
			return removed
				? ok(interaction, "starboard:deleted", { name })
				: void reply.error(interaction, t("starboard:notFound"));
		}
		case "list": {
			const boards = await listBoards(gid);
			if (boards.length === 0) return ok(interaction, "starboard:list.empty", {}, Accent.info);
			return void reply.components(interaction, [
				container(Accent.warn, [
					text(t("starboard:list.title")),
					text(boards.map(boardSummary).join("\n\n")),
				]),
			]);
		}
		case "edit": {
			const name = interaction.options.getString("name", true);
			const patch: Partial<Starboard> = {};
			const ri = interaction.options.getInteger("required_stars");
			if (ri !== null) patch.requiredStars = ri;
			const rs = interaction.options.getInteger("remove_stars");
			if (rs !== null) patch.removeStars = rs === 0 ? null : rs;
			const em = interaction.options.getString("emojis");
			if (em !== null) {
				const list = parseEmojiList(em);
				if (list.length) patch.emojis = list;
			}
			const ss = interaction.options.getBoolean("self_star");
			if (ss !== null) patch.selfStar = ss;
			const fb = interaction.options.getBoolean("filter_bots");
			if (fb !== null) patch.filterBots = fb;
			const sd = interaction.options.getBoolean("sync_deletes");
			if (sd !== null) patch.syncDeletes = sd;
			const rr = interaction.options.getRole("reward_role");
			if (rr) patch.rewardRoleId = rr.id;
			const rws = interaction.options.getInteger("reward_stars");
			if (rws !== null) {
				patch.rewardStars = rws;
				if (rws === 0) patch.rewardRoleId = null;
			}
			const ar = interaction.options.getRole("author_role");
			if (ar) patch.authorRoleId = ar.id;
			const en = interaction.options.getBoolean("enabled");
			if (en !== null) patch.enabled = en;
			const dv = interaction.options.getString("downvote_emojis");
			if (dv !== null) patch.downvoteEmojis = parseEmojiList(dv);
			const rinv = interaction.options.getBoolean("remove_invalid");
			if (rinv !== null) patch.removeInvalid = rinv;
			const mc = interaction.options.getInteger("min_chars");
			if (mc !== null) patch.minChars = mc;
			const ma = interaction.options.getInteger("min_attachments");
			if (ma !== null) patch.minAttachments = ma;
			const rimg = interaction.options.getBoolean("require_image");
			if (rimg !== null) patch.requireImage = rimg;
			const mah = interaction.options.getInteger("max_age_hours");
			if (mah !== null) patch.maxMessageAgeHours = mah;
			const rn = interaction.options.getBoolean("require_nsfw");
			if (rn !== null) patch.requireNsfwChannel = rn;
			const dt = interaction.options.getString("display_tiers");
			if (dt !== null) {
				patch.displayTiers = parseDisplayTiers(dt) as unknown as Starboard["displayTiers"];
			}

			const updated = await updateBoard(gid, name, patch);
			return updated
				? ok(interaction, "starboard:edited", { name })
				: void reply.error(interaction, t("starboard:notFound"));
		}
		case "ignore": {
			const name = interaction.options.getString("name", true);
			const channel = interaction.options.getChannel("channel", true);
			const board = await getBoard(gid, name);
			if (!board) return void reply.error(interaction, t("starboard:notFound"));
			const isIgnored = board.ignoredChannels.includes(channel.id);
			const next = isIgnored
				? board.ignoredChannels.filter((c) => c !== channel.id)
				: [...board.ignoredChannels, channel.id];
			await updateBoard(gid, name, { ignoredChannels: next });
			return ok(interaction, isIgnored ? "starboard:unignored" : "starboard:ignored", {
				channel: `<#${channel.id}>`,
				name,
			});
		}
		case "block":
		case "allow": {
			const name = interaction.options.getString("name", true);
			const board = await getBoard(gid, name);
			if (!board) return void reply.error(interaction, t("starboard:notFound"));
			const role = interaction.options.getRole("role");
			const channel = interaction.options.getChannel("channel");
			const user = interaction.options.getUser("user");
			if (!role && !channel && !user)
				return void reply.error(interaction, t("starboard:pickTarget"));
			const block = sub === "block";
			const patch: Partial<Starboard> = {};
			if (role)
				patch[block ? "blacklistRoles" : "whitelistRoles"] = toggle(
					block ? board.blacklistRoles : board.whitelistRoles,
					role.id,
				);
			if (channel)
				patch[block ? "blacklistChannels" : "whitelistChannels"] = toggle(
					block ? board.blacklistChannels : board.whitelistChannels,
					channel.id,
				);
			if (user)
				patch[block ? "blacklistUsers" : "whitelistUsers"] = toggle(
					block ? board.blacklistUsers : board.whitelistUsers,
					user.id,
				);
			await updateBoard(gid, name, patch);
			return ok(interaction, block ? "starboard:blocked" : "starboard:allowed", { name });
		}
		case "leaderboard": {
			const top = await topStarred(gid, 10);
			if (top.length === 0) return ok(interaction, "starboard:lb.empty", {}, Accent.info);
			const lines = top.map((r, i) => `**${i + 1}.** <@${r.authorId}> - ⭐ ${r.stars}`);
			return void reply.components(interaction, [
				container(Accent.warn, [text(t("starboard:lb.title")), text(lines.join("\n"))]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const starboard: BotModule = {
	name: "starboard",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	events: starboardEvents,
	i18n: {
		created: "⭐ Created starboard **{name}** posting to {channel}.",
		deleted: "🗑️ Deleted starboard **{name}**.",
		edited: "⚙️ Updated starboard **{name}**.",
		exists: "A starboard with that name already exists.",
		notFound: "No starboard with that name.",
		ignored: "🙈 **{name}** now ignores {channel}.",
		unignored: "👀 **{name}** no longer ignores {channel}.",
		blocked: "🚫 Updated **{name}**'s blacklist.",
		allowed: "✅ Updated **{name}**'s whitelist.",
		pickTarget: "Provide a role, channel, and/or user to toggle.",
		"override.created":
			"🧩 Created override **{name}** on **{board}**. Tune it with `/starboard override set`.",
		"override.updated": "🧩 Updated override **{name}**.",
		"override.deleted": "🗑️ Deleted override **{name}**.",
		"override.exists": "An override with that name already exists on this board.",
		"override.needScope": "Give the override a channel or a role to scope it to.",
		"override.notFound": "No override with that name on this board.",
		"list.title": "# ⭐ Starboards",
		"list.empty": "No starboards yet. Create one with `/starboard create`.",
		"lb.title": "# ⭐ Starboard leaderboard",
		"lb.empty": "No starred messages yet.",
		"autostar.title": "# ⭐ Auto-star channels",
		"autostar.empty": "No auto-star channels. Add one with `/starboard autostar add`.",
		"autostar.added": "⭐ Now auto-reacting in {channel}.",
		"autostar.removed": "➖ Stopped auto-reacting in {channel}.",
		"autostar.notFound": "That channel is not an auto-star channel.",
	},
};

export default starboard;
