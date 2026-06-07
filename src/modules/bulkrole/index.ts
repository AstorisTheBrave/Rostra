import {
	type ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type SlashCommandStringOption,
} from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { reply } from "@/ui";
import { applyRoleToAll, type MemberFilter, type RoleAction } from "./service.ts";

const whoOption = (o: SlashCommandStringOption): SlashCommandStringOption =>
	o
		.setName("who")
		.setDescription("Who to affect (default everyone)")
		.addChoices(
			{ name: "Everyone", value: "all" },
			{ name: "Humans only", value: "humans" },
			{ name: "Bots only", value: "bots" },
		);

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("role")
		.setDescription("Bulk role tools")
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
	cmd.addSubcommandGroup((g) =>
		g
			.setName("all")
			.setDescription("Apply a role to everyone")
			.addSubcommand((s) =>
				s
					.setName("add")
					.setDescription("Give a role to every matching member")
					.addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
					.addStringOption(whoOption),
			)
			.addSubcommand((s) =>
				s
					.setName("remove")
					.setDescription("Remove a role from every matching member")
					.addRoleOption((o) =>
						o.setName("role").setDescription("Role to remove").setRequired(true),
					)
					.addStringOption(whoOption),
			),
	);
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));

	const action = interaction.options.getSubcommand() as RoleAction;
	const role = interaction.options.getRole("role", true);
	const filter = (interaction.options.getString("who") ?? "all") as MemberFilter;

	if (role.managed) return void reply.error(interaction, t("bulkrole:managed"));
	const me = guild.members.me;
	if (me && role.position >= me.roles.highest.position) {
		return void reply.error(interaction, t("bulkrole:tooHigh"));
	}
	if (role.id === guild.id) return void reply.error(interaction, t("bulkrole:everyone"));

	const res = await applyRoleToAll(guild, role.id, action, filter);
	const verb = action === "add" ? t("bulkrole:verb.added") : t("bulkrole:verb.removed");
	return void reply.success(
		interaction,
		t("bulkrole:done", {
			verb,
			role: `<@&${role.id}>`,
			changed: res.changed,
			skipped: res.skipped,
			failed: res.failed,
		}),
	);
}

const roleCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const bulkrole: BotModule = {
	name: "bulkrole",
	commands: [roleCommand],
	i18n: {
		done: "✅ {verb} {role} for **{changed}** member(s). Skipped {skipped}, failed {failed}.",
		"verb.added": "Added",
		"verb.removed": "Removed",
		managed: "That role is managed by an integration and cannot be assigned manually.",
		tooHigh: "That role is above my highest role, so I cannot assign it.",
		everyone: "The @everyone role cannot be bulk-assigned.",
	},
};

export default bulkrole;
