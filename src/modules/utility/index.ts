import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, gallery, reply, section, text } from "@/utils/components.ts";
import {
	type ChatInputCommandInteraction,
	GuildMember as GuildMemberClass,
	SlashCommandBuilder,
} from "discord.js";

function ts(date: Date | number, style: "F" | "R" = "R"): string {
	const seconds = Math.floor((typeof date === "number" ? date : date.getTime()) / 1000);
	return `<t:${seconds}:${style}>`;
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("util").setDescription("Utility and info tools");
	cmd.addSubcommand((s) =>
		s
			.setName("avatar")
			.setDescription("Show a user's avatar")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("banner")
			.setDescription("Show a user's banner")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("userinfo")
			.setDescription("Show information about a user")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) =>
		s.setName("serverinfo").setDescription("Show information about this server"),
	);
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const sub = interaction.options.getSubcommand();

	switch (sub) {
		case "avatar": {
			const user = interaction.options.getUser("user") ?? interaction.user;
			const url = user.displayAvatarURL({ size: 512 });
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("utility:avatar.title", { user: user.tag })),
					gallery([url]),
				]),
			]);
		}
		case "banner": {
			const target = interaction.options.getUser("user") ?? interaction.user;
			const full = await interaction.client.users.fetch(target.id, { force: true });
			const url = full.bannerURL({ size: 1024 });
			if (!url)
				return void reply.error(interaction, t("utility:banner.none", { user: target.tag }));
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("utility:banner.title", { user: target.tag })),
					gallery([url]),
				]),
			]);
		}
		case "userinfo": {
			const user = interaction.options.getUser("user") ?? interaction.user;
			const member = interaction.options.getMember("user");
			const lines = [
				t("utility:userinfo.title", { user: user.tag }),
				t("utility:userinfo.id", { id: user.id }),
				t("utility:userinfo.created", { when: ts(user.createdAt, "F") }),
				t("utility:userinfo.bot", { bot: user.bot ? "Yes" : "No" }),
			];
			if (member instanceof GuildMemberClass) {
				if (member.joinedAt)
					lines.push(t("utility:userinfo.joined", { when: ts(member.joinedAt, "F") }));
				lines.push(t("utility:userinfo.roles", { count: member.roles.cache.size - 1 }));
			}
			return void reply.components(interaction, [
				container(Accent.info, [section(lines, user.displayAvatarURL({ size: 256 }))]),
			]);
		}
		case "serverinfo": {
			const guild = interaction.guild;
			if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));
			const owner = await guild.fetchOwner().catch(() => null);
			const lines = [
				t("utility:serverinfo.title", { name: guild.name }),
				t("utility:serverinfo.id", { id: guild.id }),
				t("utility:serverinfo.owner", { owner: owner ? owner.user.tag : "Unknown" }),
				t("utility:serverinfo.created", { when: ts(guild.createdAt, "F") }),
				t("utility:serverinfo.members", { count: guild.memberCount }),
				t("utility:serverinfo.channels", { count: guild.channels.cache.size }),
				t("utility:serverinfo.roles", { count: guild.roles.cache.size }),
				t("utility:serverinfo.boosts", { count: guild.premiumSubscriptionCount ?? 0 }),
			];
			const icon = guild.iconURL({ size: 256 });
			const body = icon ? [section(lines, icon)] : [text(lines.join("\n"))];
			return void reply.components(interaction, [container(Accent.info, body)]);
		}
		default:
			await reply.error(interaction, t("common:error.generic"));
	}
}

const utilCommand: SlashCommand = {
	data: buildData(),
	execute,
};

const utility: BotModule = {
	name: "utility",
	commands: [utilCommand],
	i18n: {
		"avatar.title": "# {user}'s avatar",
		"banner.title": "# {user}'s banner",
		"banner.none": "**{user}** has no banner set.",
		"userinfo.title": "# {user}",
		"userinfo.id": "**ID:** `{id}`",
		"userinfo.created": "**Account created:** {when}",
		"userinfo.bot": "**Bot:** {bot}",
		"userinfo.joined": "**Joined server:** {when}",
		"userinfo.roles": "**Roles:** {count}",
		"serverinfo.title": "# {name}",
		"serverinfo.id": "**ID:** `{id}`",
		"serverinfo.owner": "**Owner:** {owner}",
		"serverinfo.created": "**Created:** {when}",
		"serverinfo.members": "**Members:** {count}",
		"serverinfo.channels": "**Channels:** {count}",
		"serverinfo.roles": "**Roles:** {count}",
		"serverinfo.boosts": "**Boosts:** {count}",
	},
};

export default utility;
