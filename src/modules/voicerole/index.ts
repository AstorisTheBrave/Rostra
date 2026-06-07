import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { voiceRoleEvents } from "./events.ts";
import { disableConfig, getConfig, setConfig } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("voicerole")
		.setDescription("Give a role to members while they are in voice")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
	cmd.addSubcommand((s) =>
		s
			.setName("set")
			.setDescription("Set the role to grant while in voice")
			.addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true)),
	);
	cmd.addSubcommand((s) => s.setName("disable").setDescription("Stop granting a voice role"));
	cmd.addSubcommand((s) => s.setName("status").setDescription("Show the current voice role"));
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "set": {
			const role = interaction.options.getRole("role", true);
			const me = guild.members.me;
			if (me && role.position >= me.roles.highest.position) {
				return void reply.error(interaction, t("voicerole:set.tooHigh"));
			}
			await setConfig(guild.id, role.id);
			return void reply.success(
				interaction,
				t("voicerole:set.ok", { role: `<@&${role.id}>` }),
				true,
			);
		}
		case "disable": {
			const removed = await disableConfig(guild.id);
			if (!removed) return void reply.error(interaction, t("voicerole:disable.none"));
			return void reply.success(interaction, t("voicerole:disable.ok"), true);
		}
		default: {
			const config = await getConfig(guild.id);
			return void reply.components(
				interaction,
				[
					container(Accent.info, [
						text(
							config
								? t("voicerole:status.on", { role: `<@&${config.roleId}>` })
								: t("voicerole:status.off"),
						),
					]),
				],
				true,
			);
		}
	}
}

const voiceRoleCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const voicerole: BotModule = {
	name: "voicerole",
	commands: [voiceRoleCommand],
	events: voiceRoleEvents,
	i18n: {
		"set.ok": "🎙️ Members will get {role} while connected to voice.",
		"set.tooHigh": "That role is above my highest role, so I cannot assign it.",
		"disable.ok": "🔇 Voice role disabled.",
		"disable.none": "No voice role is set.",
		"status.on": "🎙️ Voice role: {role}",
		"status.off": "No voice role is set. Use `/voicerole set`.",
	},
};

export default voicerole;
