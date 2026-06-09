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
	cmd.addSubcommand((s) =>
		s
			.setName("appealonly")
			.setDescription("Only let members with a moderation case open modmail")
			.addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("block")
			.setDescription("Block a member from opening modmail")
			.addUserOption((o) => o.setName("user").setDescription("Member to block").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("unblock")
			.setDescription("Let a blocked member open modmail again")
			.addUserOption((o) =>
				o.setName("user").setDescription("Member to unblock").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("blocklist").setDescription("List blocked members"));
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
							appeal: config?.appealOnly ? "on" : "off",
							blocked: config?.blockedUsers.length ?? 0,
						}),
					),
				]),
			]);
		}
		case "appealonly": {
			const enabled = interaction.options.getBoolean("enabled", true);
			await upsertConfig(guild.id, { appealOnly: enabled });
			return void reply.success(
				interaction,
				t(enabled ? "modmail:appealOn" : "modmail:appealOff"),
				true,
			);
		}
		case "block": {
			const target = interaction.options.getUser("user", true);
			const config = await getConfig(guild.id);
			const next = [...new Set([...(config?.blockedUsers ?? []), target.id])];
			await upsertConfig(guild.id, { blockedUsers: next });
			return void reply.success(interaction, t("modmail:blocked", { user: target.tag }), true);
		}
		case "unblock": {
			const target = interaction.options.getUser("user", true);
			const config = await getConfig(guild.id);
			const next = (config?.blockedUsers ?? []).filter((id) => id !== target.id);
			await upsertConfig(guild.id, { blockedUsers: next });
			return void reply.success(interaction, t("modmail:unblocked", { user: target.tag }), true);
		}
		case "blocklist": {
			const config = await getConfig(guild.id);
			const ids = config?.blockedUsers ?? [];
			const body = ids.length
				? ids.map((id) => `<@${id}>`).join(", ")
				: t("modmail:blocklistEmpty");
			return void reply.components(interaction, [
				container(Accent.info, [text(t("modmail:blocklistTitle")), text(body)]),
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
			"📬 Modmail is on. New DMs to the bot open a thread in {channel}. Make sure only staff can see that channel. To cut abuse, turn on appeal-only with `/modmail appealonly enabled:true`, or block a member with `/modmail block`.",
		disabled: "📪 Modmail turned off.",
		notThread: "Run this inside an open modmail thread.",
		closed: "📪 Modmail thread closed.",
		closedDm:
			"📪 Your conversation with **{guild}** staff has been closed. DM again to start a new one.",
		appealOn:
			"📪 Modmail is now appeal-only. Only members with a moderation case (warning, timeout, ban) can open a thread.",
		appealOff: "📬 Modmail is open to all members again.",
		blocked: "🚫 **{user}** can no longer open modmail.",
		unblocked: "✅ **{user}** can open modmail again.",
		blocklistTitle: "# 🚫 Modmail block list",
		blocklistEmpty: "No one is blocked.",
		"status.title": "# 📬 Modmail settings",
		"status.body":
			"Status: **{state}**\nStaff channel: {channel}\nAppeal-only: **{appeal}**\nBlocked members: **{blocked}**",
	},
};

export default modmail;
