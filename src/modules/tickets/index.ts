import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import type { TicketConfig } from "@prisma/client";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	type MessageComponentInteraction,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type TextChannel,
} from "discord.js";
import {
	claimTicket,
	closeTicket,
	createTicket,
	getConfig,
	isSupport,
	upsertConfig,
} from "./service.ts";

function panelRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("ticket:open")
			.setLabel("Open Ticket")
			.setEmoji("🎫")
			.setStyle(ButtonStyle.Primary),
	);
}

function controlRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("ticket:claim")
			.setLabel("Claim")
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId("ticket:close")
			.setLabel("Close")
			.setEmoji("🔒")
			.setStyle(ButtonStyle.Danger),
	);
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("ticket")
		.setDescription("Support ticket system")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

	cmd.addSubcommand((s) => s.setName("enable").setDescription("Enable tickets"));
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Disable tickets"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show ticket settings"));
	cmd.addSubcommand((s) =>
		s.setName("panel").setDescription("Post the ticket panel in this channel"),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("category")
			.setDescription("Category new tickets are created under")
			.addChannelOption((o) => o.setName("category").setDescription("Category").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("logchannel")
			.setDescription("Where closed-ticket logs go")
			.addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("close").setDescription("Close the current ticket"));
	cmd.addSubcommand((s) => s.setName("claim").setDescription("Claim the current ticket"));
	cmd.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a user to the current ticket")
			.addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
	);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("supportrole")
			.setDescription("Roles that can manage tickets")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Add a support role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a support role")
					.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
			),
	);
	return cmd;
}

function uniq(list: string[]): string[] {
	return [...new Set(list)];
}

async function ensureConfig(guildId: string): Promise<TicketConfig> {
	return (await getConfig(guildId)) ?? (await upsertConfig(guildId, {}));
}

async function ok(
	interaction: ChatInputCommandInteraction,
	key: string,
	vars: Record<string, string | number> = {},
): Promise<void> {
	await reply.components(interaction, [container(Accent.success, [text(t(key, vars))])]);
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const member = interaction.member as GuildMember | null;
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === "supportrole") {
		const role = interaction.options.getRole("role", true);
		const cfg = await ensureConfig(guild.id);
		const next =
			sub === "add"
				? uniq([...cfg.supportRoleIds, role.id])
				: cfg.supportRoleIds.filter((r) => r !== role.id);
		await upsertConfig(guild.id, { supportRoleIds: next });
		return ok(interaction, `tickets:supportrole.${sub}`, { role: role.name });
	}

	switch (sub) {
		case "enable":
			await upsertConfig(guild.id, { enabled: true });
			return ok(interaction, "tickets:enabled");
		case "disable":
			await upsertConfig(guild.id, { enabled: false });
			return ok(interaction, "tickets:disabled");
		case "category": {
			const category = interaction.options.getChannel("category", true);
			await upsertConfig(guild.id, { categoryId: category.id });
			return ok(interaction, "tickets:category.set", { name: category.name ?? "category" });
		}
		case "logchannel": {
			const channel = interaction.options.getChannel("channel", true);
			await upsertConfig(guild.id, { logChannelId: channel.id });
			return ok(interaction, "tickets:logchannel.set", { channel: `<#${channel.id}>` });
		}
		case "panel": {
			const cfg = await ensureConfig(guild.id);
			const channel = interaction.channel;
			if (!channel?.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("tickets:error.badChannel"));
			}
			await channel.send({
				components: [
					container(Accent.info, [text(`# ${cfg.panelTitle}`), text(cfg.panelMessage)]),
					panelRow(),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			return ok(interaction, "tickets:panel.posted");
		}
		case "claim": {
			const channel = interaction.channel;
			if (
				!channel ||
				!("name" in channel) ||
				!member ||
				!isSupport(member, await ensureConfig(guild.id))
			) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const claimed = await claimTicket(channel.id, interaction.user.id);
			return claimed
				? ok(interaction, "tickets:claimed", { user: interaction.user.tag })
				: void reply.error(interaction, t("tickets:error.notTicket"));
		}
		case "add": {
			const channel = interaction.channel as TextChannel | null;
			const user = interaction.options.getUser("user", true);
			if (!channel || !("permissionOverwrites" in channel)) {
				return void reply.error(interaction, t("tickets:error.notTicket"));
			}
			await channel.permissionOverwrites.edit(user.id, {
				ViewChannel: true,
				SendMessages: true,
				ReadMessageHistory: true,
			});
			return ok(interaction, "tickets:added", { user: user.tag });
		}
		case "close": {
			const channel = interaction.channel as TextChannel | null;
			if (!channel || !("name" in channel)) {
				return void reply.error(interaction, t("tickets:error.notTicket"));
			}
			await closeAndDelete(channel, interaction.user.tag);
			return void reply.success(interaction, t("tickets:closing"), true);
		}
		case "status": {
			const cfg = await getConfig(guild.id);
			if (!cfg) return ok(interaction, "tickets:status.unconfigured");
			const lines = [
				t("tickets:status.title"),
				t("tickets:status.line", {
					enabled: cfg.enabled ? "on" : "off",
					category: cfg.categoryId ? `<#${cfg.categoryId}>` : "none",
					log: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "none",
					roles: cfg.supportRoleIds.length,
				}),
			];
			return void reply.components(interaction, [container(Accent.info, [text(lines.join("\n"))])]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

async function closeAndDelete(channel: TextChannel, closedBy: string): Promise<void> {
	const result = await closeTicket(channel);
	const config = await getConfig(channel.guild.id);
	if (result && config?.logChannelId) {
		const logChannel = await channel.guild.channels.fetch(config.logChannelId).catch(() => null);
		if (logChannel?.isTextBased()) {
			await logChannel
				.send({
					components: [
						container(Accent.warn, [
							text("## 🔒 Ticket closed"),
							text(
								`**Ticket #${result.number}** • opener <@${result.userId}> • closed by ${closedBy}`,
							),
						]),
					],
					flags: MessageFlags.IsComponentsV2,
				})
				.catch(() => {});
		}
	}
	setTimeout(() => void channel.delete().catch(() => {}), 5000);
}

const ticketComponents: ComponentHandler = {
	prefix: "ticket",
	execute: async (interaction, args, _client) => {
		const action = args[0];
		const guild = interaction.guild;
		if (!guild || !interaction.isButton()) return;
		const config = await getConfig(guild.id);

		if (action === "open") {
			if (!config || !config.enabled) {
				return void reply.error(interaction, t("tickets:error.disabled"));
			}
			const result = await createTicket(guild, config, interaction.user);
			if (!result.ok) return void reply.error(interaction, t(result.messageKey));
			await result.channel.send({
				components: [
					container(Accent.success, [text(`<@${interaction.user.id}>`), text(config.openMessage)]),
					controlRow(),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			return void reply.success(
				interaction,
				t("tickets:opened", { channel: `<#${result.channel.id}>` }),
				true,
			);
		}

		const member = interaction.member as GuildMember | null;
		const channel = interaction.channel as TextChannel | null;
		if (!channel || !config) return;

		if (action === "claim") {
			if (!member || !isSupport(member, config)) {
				return void reply.error(interaction, t("common:error.missingPermissions"));
			}
			const claimed = await claimTicket(channel.id, interaction.user.id);
			return claimed
				? void reply.success(interaction, t("tickets:claimed", { user: interaction.user.tag }))
				: void reply.error(interaction, t("tickets:error.notTicket"));
		}

		if (action === "close") {
			const isOwner = await import("@/services/database.ts").then(({ getPrisma }) =>
				getPrisma().ticket.findUnique({ where: { channelId: channel.id } }),
			);
			const allowed =
				(member && isSupport(member, config)) || isOwner?.userId === interaction.user.id;
			if (!allowed) return void reply.error(interaction, t("common:error.missingPermissions"));
			await reply.success(interaction, t("tickets:closing"), true);
			await closeAndDelete(channel, interaction.user.tag);
		}
	},
};

const ticketCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const tickets: BotModule = {
	name: "tickets",
	commands: [ticketCommand],
	components: [ticketComponents],
	i18n: {
		enabled: "🎫 Tickets **enabled**.",
		disabled: "🎫 Tickets **disabled**.",
		"category.set": "📂 Ticket category set to **{name}**.",
		"logchannel.set": "📋 Ticket log channel set to {channel}.",
		"panel.posted": "✅ Ticket panel posted.",
		"supportrole.add": "✅ **{role}** can now manage tickets.",
		"supportrole.remove": "➖ **{role}** can no longer manage tickets.",
		opened: "🎫 Your ticket is ready: {channel}",
		claimed: "🙋 Ticket claimed by **{user}**.",
		added: "➕ Added **{user}** to the ticket.",
		closing: "🔒 Closing this ticket…",
		"status.title": "# 🎫 Ticket settings",
		"status.line":
			"**Enabled:** {enabled} • **Category:** {category}\n**Log:** {log} • **Support roles:** {roles}",
		"status.unconfigured": "Tickets are not set up. Use `/ticket enable` and `/ticket panel`.",
		"error.disabled": "The ticket system is disabled here.",
		"error.alreadyOpen": "You already have an open ticket.",
		"error.createFailed": "Couldn't create the ticket channel — check my permissions.",
		"error.notTicket": "This isn't a ticket channel.",
		"error.badChannel": "Use this in a text channel.",
	},
};

export default tickets;
