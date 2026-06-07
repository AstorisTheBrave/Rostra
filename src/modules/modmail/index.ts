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
import { modmailEvents } from "./events.ts";
import { closeThread, getConfig, getThreadByChannel, upsertConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("modmail")
		.setDescription("Let members DM the bot to reach staff")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Set the staff channel where modmail threads open")
			.addChannelOption((o) =>
				o.setName("channel").setDescription("Staff-only text channel").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Turn modmail off"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show modmail settings"));
	cmd.addSubcommand((s) =>
		s.setName("close").setDescription("Close the modmail thread you run this in"),
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

	switch (sub) {
		case "setup": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { channelId: channel.id, enabled: true });
			await setFeatures(guild.id, { modmail: true });
			return void reply.success(
				interaction,
				t("modmail:setupDone", { channel: `<#${channel.id}>` }),
				true,
			);
		}
		case "disable": {
			await upsertConfig(guild.id, { enabled: false });
			return void reply.success(interaction, t("modmail:disabled"), true);
		}
		case "status": {
			const config = await getConfig(guild.id);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("modmail:status.title")),
					text(
						t("modmail:status.body", {
							state: config?.enabled ? "on" : "off",
							channel: config?.channelId ? `<#${config.channelId}>` : "—",
						}),
					),
				]),
			]);
		}
		case "close": {
			const record = await getThreadByChannel(interaction.channelId);
			if (!record?.open) return void reply.error(interaction, t("modmail:notThread"));
			await closeThread(interaction.channelId);
			const user = await interaction.client.users.fetch(record.userId).catch(() => null);
			await user?.send(t("modmail:closedDm", { guild: guild.name })).catch(() => {});
			await reply.success(interaction, t("modmail:closed"), false);
			const thread = await guild.channels.fetch(interaction.channelId).catch(() => null);
			if (thread?.isThread()) await thread.setArchived(true, "Modmail closed").catch(() => {});
			return;
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const modmail: BotModule = {
	name: "modmail",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	events: modmailEvents,
	i18n: {
		setupDone:
			"📬 Modmail is on. New DMs to the bot open a thread in {channel}. Make sure only staff can see that channel.",
		disabled: "📪 Modmail turned off.",
		notThread: "Run this inside an open modmail thread.",
		closed: "📪 Modmail thread closed.",
		closedDm:
			"📪 Your conversation with **{guild}** staff has been closed. DM again to start a new one.",
		"status.title": "# 📬 Modmail settings",
		"status.body": "Status: **{state}**\nStaff channel: {channel}",
	},
};

export default modmail;
