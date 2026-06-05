import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/utils/components.ts";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import {
	type PanelRole,
	addRole,
	createPanel,
	deletePanel,
	getPanel,
	listPanels,
	parseRoles,
	removeRole,
	setMessage,
} from "./service.ts";

function buttonRows(panelId: string, roles: PanelRole[]): ActionRowBuilder<ButtonBuilder>[] {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < roles.length && rows.length < 5; i += 5) {
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const role of roles.slice(i, i + 5)) {
			const button = new ButtonBuilder()
				.setCustomId(`rr:${panelId}:${role.roleId}`)
				.setLabel(role.label)
				.setStyle(ButtonStyle.Secondary);
			if (role.emoji) button.setEmoji(role.emoji);
			row.addComponents(button);
		}
		rows.push(row);
	}
	return rows;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("reactionrole")
		.setDescription("Self-assignable role panels")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

	cmd.addSubcommand((s) =>
		s
			.setName("create")
			.setDescription("Create a panel")
			.addStringOption((o) => o.setName("title").setDescription("Panel title").setRequired(true))
			.addStringOption((o) =>
				o
					.setName("mode")
					.setDescription("How many roles members can pick")
					.addChoices({ name: "Multiple", value: "multiple" }, { name: "Single", value: "single" }),
			),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("addrole")
			.setDescription("Add a role to a panel")
			.addStringOption((o) => o.setName("panel").setDescription("Panel ID").setRequired(true))
			.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
			.addStringOption((o) => o.setName("label").setDescription("Button label").setRequired(true))
			.addStringOption((o) => o.setName("emoji").setDescription("Optional emoji")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("removerole")
			.setDescription("Remove a role from a panel")
			.addStringOption((o) => o.setName("panel").setDescription("Panel ID").setRequired(true))
			.addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("post")
			.setDescription("Post a panel in this channel")
			.addStringOption((o) => o.setName("panel").setDescription("Panel ID").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("list").setDescription("List panels"));
	cmd.addSubcommand((s) =>
		s
			.setName("delete")
			.setDescription("Delete a panel")
			.addStringOption((o) => o.setName("panel").setDescription("Panel ID").setRequired(true)),
	);
	return cmd;
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
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "create": {
			const title = interaction.options.getString("title", true);
			const mode = interaction.options.getString("mode") ?? "multiple";
			const panel = await createPanel(guild.id, title, mode);
			return ok(interaction, "reactionroles:created", { id: panel.id });
		}
		case "addrole": {
			const id = interaction.options.getString("panel", true);
			const role = interaction.options.getRole("role", true);
			const label = interaction.options.getString("label", true);
			const emoji = interaction.options.getString("emoji") ?? undefined;
			const roles = await addRole(id, { roleId: role.id, label, emoji });
			if (!roles) return void reply.error(interaction, t("reactionroles:notFound"));
			return ok(interaction, "reactionroles:roleAdded", { role: role.name, count: roles.length });
		}
		case "removerole": {
			const id = interaction.options.getString("panel", true);
			const role = interaction.options.getRole("role", true);
			const roles = await removeRole(id, role.id);
			if (!roles) return void reply.error(interaction, t("reactionroles:notFound"));
			return ok(interaction, "reactionroles:roleRemoved", { role: role.name });
		}
		case "post": {
			const id = interaction.options.getString("panel", true);
			const panel = await getPanel(id);
			if (!panel || panel.guildId !== guild.id)
				return void reply.error(interaction, t("reactionroles:notFound"));
			const roles = parseRoles(panel);
			if (roles.length === 0) return void reply.error(interaction, t("reactionroles:noRoles"));
			const channel = interaction.channel;
			if (!channel?.isTextBased() || channel.isDMBased()) {
				return void reply.error(interaction, t("reactionroles:badChannel"));
			}
			const message = await channel.send({
				components: [
					container(Accent.info, [text(`# ${panel.title}`)]),
					...buttonRows(panel.id, roles),
				],
				flags: MessageFlags.IsComponentsV2,
			});
			await setMessage(panel.id, channel.id, message.id);
			return ok(interaction, "reactionroles:posted");
		}
		case "list": {
			const panels = await listPanels(guild.id);
			if (panels.length === 0) return ok(interaction, "reactionroles:listEmpty");
			const lines = panels.map(
				(p) => `**${p.title}** — \`${p.id}\` — ${parseRoles(p).length} roles (${p.mode})`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("reactionroles:listTitle")), text(lines.join("\n"))]),
			]);
		}
		case "delete": {
			const id = interaction.options.getString("panel", true);
			const panel = await getPanel(id);
			if (!panel || panel.guildId !== guild.id)
				return void reply.error(interaction, t("reactionroles:notFound"));
			await deletePanel(id);
			return ok(interaction, "reactionroles:deleted");
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const reactionRoleComponent: ComponentHandler = {
	prefix: "rr",
	execute: async (interaction, args) => {
		if (!interaction.isButton() || !interaction.guild) return;
		const [panelId, roleId] = args;
		if (!panelId || !roleId) return;
		const panel = await getPanel(panelId);
		if (!panel) return void reply.error(interaction, t("reactionroles:notFound"));
		const member = interaction.member as GuildMember | null;
		const role = interaction.guild.roles.cache.get(roleId);
		if (!member || !role || !role.editable) {
			return void reply.error(interaction, t("reactionroles:cannotAssign"));
		}
		if (member.roles.cache.has(roleId)) {
			await member.roles.remove(roleId, "Reaction role").catch(() => {});
			return void reply.success(interaction, t("reactionroles:removed", { role: role.name }), true);
		}
		if (panel.mode === "single") {
			const others = parseRoles(panel)
				.map((r) => r.roleId)
				.filter((id) => id !== roleId && member.roles.cache.has(id));
			if (others.length)
				await member.roles.remove(others, "Reaction role (single)").catch(() => {});
		}
		await member.roles.add(roleId, "Reaction role").catch(() => {});
		return void reply.success(interaction, t("reactionroles:added", { role: role.name }), true);
	},
};

const reactionRoleCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const reactionroles: BotModule = {
	name: "reactionroles",
	commands: [reactionRoleCommand],
	components: [reactionRoleComponent],
	i18n: {
		created: "✅ Panel created. ID: `{id}`\nAdd roles with `/reactionrole addrole` then `post` it.",
		roleAdded: "✅ Added **{role}** ({count} total).",
		roleRemoved: "➖ Removed **{role}**.",
		posted: "✅ Panel posted.",
		deleted: "🗑️ Panel deleted.",
		listTitle: "# 🎚️ Reaction role panels",
		listEmpty: "No panels yet. Create one with `/reactionrole create`.",
		notFound: "No panel with that ID here.",
		noRoles: "Add roles to the panel first.",
		badChannel: "Use this in a text channel.",
		added: "✅ Gave you **{role}**.",
		removed: "➖ Removed **{role}**.",
		cannotAssign: "I can't assign that role (it may be above my highest role).",
	},
};

export default reactionroles;
