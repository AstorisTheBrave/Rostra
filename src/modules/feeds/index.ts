import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import {
	createSub,
	listSubs,
	redditPreview,
	removeSub,
	resolveYouTubeChannelId,
	rssPreview,
	twitchConfigured,
	youtubePreview,
} from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("feeds")
		.setDescription("Announce new YouTube videos and Twitch streams")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("youtube")
			.setDescription("Announce a YouTube channel's new videos")
			.addStringOption((o) =>
				o.setName("channel").setDescription("Channel id, URL, or @handle").setRequired(true),
			)
			.addChannelOption((o) =>
				o.setName("post_to").setDescription("Where to announce").setRequired(true),
			)
			.addRoleOption((o) => o.setName("mention").setDescription("Role to ping (optional)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("twitch")
			.setDescription("Announce a Twitch streamer going live")
			.addStringOption((o) =>
				o.setName("streamer").setDescription("Twitch username").setRequired(true),
			)
			.addChannelOption((o) =>
				o.setName("post_to").setDescription("Where to announce").setRequired(true),
			)
			.addRoleOption((o) => o.setName("mention").setDescription("Role to ping (optional)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("reddit")
			.setDescription("Announce a subreddit's new posts")
			.addStringOption((o) =>
				o.setName("subreddit").setDescription("Subreddit name (without r/)").setRequired(true),
			)
			.addChannelOption((o) =>
				o.setName("post_to").setDescription("Where to announce").setRequired(true),
			)
			.addRoleOption((o) => o.setName("mention").setDescription("Role to ping (optional)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("rss")
			.setDescription("Announce new items from any RSS or Atom feed")
			.addStringOption((o) => o.setName("url").setDescription("Feed URL").setRequired(true))
			.addChannelOption((o) =>
				o.setName("post_to").setDescription("Where to announce").setRequired(true),
			)
			.addRoleOption((o) => o.setName("mention").setDescription("Role to ping (optional)")),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List this server's feeds"));
	cmd.addSubcommand((s) =>
		s
			.setName("remove")
			.setDescription("Remove a feed")
			.addStringOption((o) => o.setName("id").setDescription("Feed ID").setRequired(true)),
	);
	return cmd;
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
	const mention = interaction.options.getRole("mention")?.id ?? null;

	switch (sub) {
		case "youtube": {
			const input = interaction.options.getString("channel", true);
			const postTo = interaction.options.getChannel("post_to", true);
			const channelId = await resolveYouTubeChannelId(input);
			if (!channelId) return void reply.error(interaction, t("feeds:error.youtubeNotFound"));
			const preview = await youtubePreview(channelId);
			if (!preview) return void reply.error(interaction, t("feeds:error.youtubeNotFound"));
			await createSub({
				guildId: guild.id,
				channelId: postTo.id,
				type: "youtube",
				sourceId: channelId,
				sourceName: preview.name,
				mention,
				lastItemId: preview.latestVideoId,
			});
			return void reply.success(
				interaction,
				t("feeds:youtubeAdded", { name: preview.name, channel: `<#${postTo.id}>` }),
				true,
			);
		}
		case "twitch": {
			if (!twitchConfigured()) return void reply.error(interaction, t("feeds:error.twitchOff"));
			const login = interaction.options.getString("streamer", true).toLowerCase().replace(/^@/, "");
			const postTo = interaction.options.getChannel("post_to", true);
			await createSub({
				guildId: guild.id,
				channelId: postTo.id,
				type: "twitch",
				sourceId: login,
				sourceName: login,
				mention,
				lastItemId: null,
			});
			return void reply.success(
				interaction,
				t("feeds:twitchAdded", { name: login, channel: `<#${postTo.id}>` }),
				true,
			);
		}
		case "reddit": {
			const subreddit = interaction.options
				.getString("subreddit", true)
				.trim()
				.replace(/^\/?r\//i, "");
			const postTo = interaction.options.getChannel("post_to", true);
			const preview = await redditPreview(subreddit);
			if (!preview) return void reply.error(interaction, t("feeds:error.redditNotFound"));
			await createSub({
				guildId: guild.id,
				channelId: postTo.id,
				type: "reddit",
				sourceId: subreddit,
				sourceName: preview.name,
				mention,
				lastItemId: preview.latestId,
			});
			return void reply.success(
				interaction,
				t("feeds:redditAdded", { name: preview.name, channel: `<#${postTo.id}>` }),
				true,
			);
		}
		case "rss": {
			const url = interaction.options.getString("url", true).trim();
			if (!/^https?:\/\//i.test(url))
				return void reply.error(interaction, t("feeds:error.rssBadUrl"));
			const postTo = interaction.options.getChannel("post_to", true);
			const preview = await rssPreview(url);
			if (!preview) return void reply.error(interaction, t("feeds:error.rssNotFound"));
			await createSub({
				guildId: guild.id,
				channelId: postTo.id,
				type: "rss",
				sourceId: url,
				sourceName: preview.name,
				mention,
				lastItemId: preview.latestId,
			});
			return void reply.success(
				interaction,
				t("feeds:rssAdded", { name: preview.name, channel: `<#${postTo.id}>` }),
				true,
			);
		}
		case "list": {
			const subs = await listSubs(guild.id);
			if (subs.length === 0) {
				return void reply.components(interaction, [
					container(Accent.info, [text(t("feeds:list.empty"))]),
				]);
			}
			const lines = subs.map(
				(f) => `\`${f.id}\` - **${f.type}** ${f.sourceName ?? f.sourceId} -> <#${f.channelId}>`,
			);
			return void reply.components(
				interaction,
				[container(Accent.info, [text(t("feeds:list.title")), text(lines.join("\n"))])],
				true,
			);
		}
		case "remove": {
			const id = interaction.options.getString("id", true);
			const removed = await removeSub(id, guild.id);
			if (!removed) return void reply.error(interaction, t("feeds:error.notFound"));
			return void reply.success(interaction, t("feeds:removed"), true);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const feedsCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const feeds: BotModule = {
	name: "feeds",
	commands: [feedsCommand],
	i18n: {
		youtubeAdded: "📺 Now announcing new videos from **{name}** in {channel}.",
		twitchAdded: "🎮 Now announcing when **{name}** goes live in {channel}.",
		redditAdded: "👽 Now announcing new posts from **{name}** in {channel}.",
		rssAdded: "📰 Now announcing new items from **{name}** in {channel}.",
		removed: "🗑️ Feed removed.",
		"list.title": "# 📡 Feeds",
		"list.empty": "No feeds set up yet.",
		"error.youtubeNotFound":
			"Could not find that YouTube channel. Try the channel id (UC...) or URL.",
		"error.twitchOff":
			"Twitch feeds are not configured on this instance (missing API credentials).",
		"error.redditNotFound": "Could not reach that subreddit. Check the name and that it is public.",
		"error.rssBadUrl":
			"That does not look like a valid URL. It must start with http:// or https://.",
		"error.rssNotFound": "Could not read a feed at that URL. Make sure it is an RSS or Atom feed.",
		"error.notFound": "No feed with that ID here.",
	},
};

export default feeds;
