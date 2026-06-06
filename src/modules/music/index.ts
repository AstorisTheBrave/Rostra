import {
	type ChatInputCommandInteraction,
	type GuildMember,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import { musicEvents } from "./events.ts";
import { getManager, isEnabled } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("music").setDescription("Music player");
	cmd.addSubcommand((s) =>
		s
			.setName("play")
			.setDescription("Play a track or playlist")
			.addStringOption((o) => o.setName("query").setDescription("Search or URL").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("skip").setDescription("Skip the current track"));
	cmd.addSubcommand((s) => s.setName("stop").setDescription("Stop and leave the voice channel"));
	cmd.addSubcommand((s) => s.setName("pause").setDescription("Pause playback"));
	cmd.addSubcommand((s) => s.setName("resume").setDescription("Resume playback"));
	cmd.addSubcommand((s) => s.setName("queue").setDescription("Show the queue"));
	cmd.addSubcommand((s) => s.setName("nowplaying").setDescription("Show the current track"));
	cmd.addSubcommand((s) =>
		s
			.setName("volume")
			.setDescription("Set the volume")
			.addIntegerOption((o) =>
				o
					.setName("percent")
					.setDescription("0-200")
					.setRequired(true)
					.setMinValue(0)
					.setMaxValue(200),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("loop")
			.setDescription("Set repeat mode")
			.addStringOption((o) =>
				o
					.setName("mode")
					.setDescription("Mode")
					.setRequired(true)
					.addChoices(
						{ name: "Off", value: "off" },
						{ name: "Track", value: "track" },
						{ name: "Queue", value: "queue" },
					),
			),
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
	client,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	if (!isEnabled()) return void reply.error(interaction, t("music:unavailable"));
	const manager = getManager(client);
	if (!manager) return void reply.error(interaction, t("music:unavailable"));

	const sub = interaction.options.getSubcommand();

	if (sub === "play") {
		const member = interaction.member as GuildMember | null;
		const voiceChannelId = member?.voice?.channelId;
		if (!voiceChannelId) return void reply.error(interaction, t("music:noVoice"));
		const query = interaction.options.getString("query", true);

		const player =
			manager.getPlayer(guild.id) ??
			manager.createPlayer({
				guildId: guild.id,
				voiceChannelId,
				textChannelId: interaction.channelId,
				selfDeaf: true,
			});
		if (!player.connected) await player.connect();

		const result = await player.search({ query }, interaction.user);
		if (!result.tracks.length) return void reply.error(interaction, t("music:noResults"));

		if (result.loadType === "playlist") {
			await player.queue.add(result.tracks);
			await ok(interaction, t("music:queuedPlaylist", { count: result.tracks.length }));
		} else {
			const track = result.tracks[0];
			if (!track) return void reply.error(interaction, t("music:noResults"));
			await player.queue.add(track);
			await ok(interaction, t("music:queued", { title: track.info.title }));
		}
		if (!player.playing && !player.paused) await player.play();
		return;
	}

	const player = manager.getPlayer(guild.id);
	if (!player) return void reply.error(interaction, t("music:nothing"));

	switch (sub) {
		case "skip":
			await player.skip();
			return ok(interaction, t("music:skipped"));
		case "stop":
			await player.destroy();
			return ok(interaction, t("music:stopped"));
		case "pause":
			await player.pause();
			return ok(interaction, t("music:paused"));
		case "resume":
			await player.resume();
			return ok(interaction, t("music:resumed"));
		case "volume": {
			const percent = interaction.options.getInteger("percent", true);
			await player.setVolume(percent);
			return ok(interaction, t("music:volume", { percent }));
		}
		case "loop": {
			const mode = interaction.options.getString("mode", true) as "off" | "track" | "queue";
			player.setRepeatMode(mode);
			return ok(interaction, t("music:loop", { mode }));
		}
		case "nowplaying": {
			const current = player.queue.current;
			if (!current) return void reply.error(interaction, t("music:nothing"));
			return ok(interaction, t("music:nowplaying", { title: current.info.title }), Accent.info);
		}
		case "queue": {
			const current = player.queue.current;
			const upcoming = player.queue.tracks.slice(0, 10);
			if (!current) return void reply.error(interaction, t("music:nothing"));
			const lines = [
				`▶️ **${current.info.title}**`,
				...upcoming.map((tr, i) => `\`${i + 1}.\` ${tr.info.title}`),
			];
			return void reply.components(interaction, [
				container(Accent.info, [text(t("music:queueTitle")), text(lines.join("\n"))]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const musicCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const music: BotModule = {
	name: "music",
	commands: [musicCommand],
	events: musicEvents,
	i18n: {
		unavailable: "Music isn't available right now.",
		noVoice: "Join a voice channel first.",
		noResults: "No results for that query.",
		nothing: "Nothing is playing.",
		queued: "➕ Queued **{title}**.",
		queuedPlaylist: "➕ Queued **{count}** tracks from the playlist.",
		skipped: "⏭️ Skipped.",
		stopped: "⏹️ Stopped and left the channel.",
		paused: "⏸️ Paused.",
		resumed: "▶️ Resumed.",
		volume: "🔊 Volume set to **{percent}%**.",
		loop: "🔁 Repeat mode: **{mode}**.",
		nowplaying: "🎵 Now playing: **{title}**.",
		queueTitle: "# 🎶 Queue",
	},
};

export default music;
