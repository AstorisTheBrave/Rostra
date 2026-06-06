import {
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, divider, reply, text } from "@/ui";
import { getConfig, upsertConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("feedback")
		.setDescription("Send feedback to the staff");
	cmd.addSubcommand((s) =>
		s
			.setName("send")
			.setDescription("Send feedback")
			.addStringOption((o) =>
				o.setName("message").setDescription("Your feedback").setRequired(true),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Set the feedback channel (Manage Server)")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true))
			.addBooleanOption((o) => o.setName("anonymous").setDescription("Hide who sent feedback")),
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

	if (sub === "setup") {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
			return void reply.error(interaction, t("common:error.missingPermissions"));
		}
		const channel = interaction.options.getChannel("channel", true);
		const anonymous = interaction.options.getBoolean("anonymous") ?? false;
		await upsertConfig(guild.id, { channelId: channel.id, anonymous });
		return void reply.components(interaction, [
			container(Accent.success, [text(t("feedback:setup", { channel: `<#${channel.id}>` }))]),
		]);
	}

	// send
	const config = await getConfig(guild.id);
	if (!config?.channelId) return void reply.error(interaction, t("feedback:unconfigured"));
	const channel = await guild.channels.fetch(config.channelId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) {
		return void reply.error(interaction, t("feedback:unconfigured"));
	}
	const message = interaction.options.getString("message", true);
	const from = config.anonymous ? t("feedback:anon") : `<@${interaction.user.id}>`;
	await channel.send({
		components: [
			container(Accent.info, [
				text(t("feedback:title")),
				divider(),
				text(message),
				divider(),
				text(t("feedback:from", { from })),
			]),
		],
		flags: MessageFlags.IsComponentsV2,
	});
	await reply.components(
		interaction,
		[container(Accent.success, [text(t("feedback:sent"))])],
		true,
	);
}

const feedbackCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const feedback: BotModule = {
	name: "feedback",
	commands: [feedbackCommand],
	i18n: {
		setup: "📮 Feedback will be sent to {channel}.",
		unconfigured: "Feedback isn't set up here yet.",
		sent: "✅ Thanks! Your feedback was sent.",
		title: "# 📮 New feedback",
		from: "*— {from}*",
		anon: "anonymous",
	},
};

export default feedback;
