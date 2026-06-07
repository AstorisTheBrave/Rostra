import {
	ButtonStyle,
	type ChatInputCommandInteraction,
	GuildMember,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import { isFeatureBlocked } from "@/services/tenant.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import { getConfig, upsertConfig } from "./service.ts";

function verifyPanel() {
	return [
		container(Accent.success, [
			text(t("verification:panel.title")),
			text(t("verification:panel.body")),
		]),
		actionRow(
			button({
				id: "verify:go",
				label: t("verification:panel.button"),
				emoji: "✅",
				style: ButtonStyle.Success,
			}),
		),
	];
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("verification")
		.setDescription("Gate your server behind a verify button")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
	cmd.addSubcommand((s) =>
		s
			.setName("setup")
			.setDescription("Set the role members get when they verify")
			.addRoleOption((o) => o.setName("role").setDescription("Verified role").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s.setName("panel").setDescription("Post the verification panel in this channel"),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Turn verification off"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show verification settings"));
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
			const role = interaction.options.getRole("role", true);
			await upsertConfig(guild.id, { roleId: role.id, enabled: true });
			return void reply.success(
				interaction,
				t("verification:setupDone", { role: `<@&${role.id}>` }),
				true,
			);
		}
		case "panel": {
			const config = await getConfig(guild.id);
			if (!config?.enabled || !config.roleId) {
				return void reply.error(interaction, t("verification:notConfigured"));
			}
			await interaction.reply({ components: verifyPanel(), flags: MessageFlags.IsComponentsV2 });
			return;
		}
		case "disable": {
			await upsertConfig(guild.id, { enabled: false });
			return void reply.success(interaction, t("verification:disabled"), true);
		}
		case "status": {
			const config = await getConfig(guild.id);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("verification:status.title")),
					text(
						t("verification:status.body", {
							state: config?.enabled ? "on" : "off",
							role: config?.roleId ? `<@&${config.roleId}>` : "—",
						}),
					),
				]),
			]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const verifyComponent: ComponentHandler = {
	prefix: "verify",
	deferEphemeral: true,
	execute: async (interaction, args) => {
		if (args[0] !== "go" || !interaction.isButton() || !interaction.inGuild()) return;
		const guildId = interaction.guildId;
		if (await isFeatureBlocked(guildId, "verification")) {
			return void reply.error(interaction, t("verification:off"));
		}
		const config = await getConfig(guildId);
		if (!config?.enabled || !config.roleId) {
			return void reply.error(interaction, t("verification:off"));
		}
		const member = interaction.member;
		if (!(member instanceof GuildMember)) return;
		if (member.roles.cache.has(config.roleId)) {
			return void reply.success(interaction, t("verification:already"), true);
		}
		try {
			await member.roles.add(config.roleId, "Verified");
		} catch {
			return void reply.error(interaction, t("verification:failed"));
		}
		return void reply.success(interaction, t("verification:welcome"), true);
	},
};

const verification: BotModule = {
	name: "verification",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	components: [verifyComponent],
	i18n: {
		setupDone:
			"🔓 Verification on. Members who verify get {role}. Post the panel with `/verification panel`.",
		disabled: "🔒 Verification turned off.",
		notConfigured: "Set a role first with `/verification setup`.",
		off: "Verification is not available right now.",
		already: "✅ You're already verified.",
		welcome: "🎉 You're verified - welcome in!",
		failed: "I couldn't assign the role - check my Manage Roles permission and role position.",
		"panel.title": "# 🔓 Verification",
		"panel.body": "Click the button below to verify and unlock the server.",
		"panel.button": "Verify",
		"status.title": "# 🔓 Verification settings",
		"status.body": "Status: **{state}**\nVerified role: {role}",
	},
};

export default verification;
