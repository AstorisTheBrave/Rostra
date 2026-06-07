import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { t } from "@/i18n/index.ts";
import type { BotModule, SlashCommand } from "@/types/module.ts";
import { Accent, container, reply, text } from "@/ui";
import { getRep, giveRep, leaderboard } from "./service.ts";

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder()
		.setName("rep")
		.setDescription("Give and track reputation points");
	cmd.addSubcommand((s) =>
		s
			.setName("give")
			.setDescription("Give a reputation point to a member")
			.addUserOption((o) => o.setName("user").setDescription("Who to thank").setRequired(true)),
	);
	cmd.addSubcommand((s) =>
		s
			.setName("view")
			.setDescription("Show a member's reputation")
			.addUserOption((o) => o.setName("user").setDescription("Member (defaults to you)")),
	);
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Top members by reputation"));
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
		case "give": {
			const target = interaction.options.getUser("user", true);
			if (target.bot) return void reply.error(interaction, t("reputation:give.bot"));
			const result = await giveRep(guild.id, interaction.user.id, target.id);
			if (!result.ok) {
				if (result.reason === "self")
					return void reply.error(interaction, t("reputation:give.self"));
				const when = Math.floor((Date.now() + result.remaining) / 1000);
				return void reply.error(
					interaction,
					t("reputation:give.cooldown", { when: `<t:${when}:R>` }),
				);
			}
			return void reply.success(
				interaction,
				t("reputation:give.ok", { user: `<@${target.id}>`, points: result.points }),
			);
		}
		case "leaderboard": {
			const entries = await leaderboard(guild.id);
			if (entries.length === 0) {
				return void reply.components(interaction, [
					container(Accent.info, [text(t("reputation:lb.empty"))]),
				]);
			}
			const medals = ["🥇", "🥈", "🥉"];
			const lines = entries.map(
				(e, i) => `${medals[i] ?? `\`#${i + 1}\``} <@${e.userId}> - **${e.points}**`,
			);
			return void reply.components(interaction, [
				container(Accent.info, [text(t("reputation:lb.title")), text(lines.join("\n"))]),
			]);
		}
		default: {
			const target = interaction.options.getUser("user") ?? interaction.user;
			const rep = await getRep(guild.id, target.id);
			return void reply.components(interaction, [
				container(Accent.info, [
					text(t("reputation:view.line", { user: `<@${target.id}>`, points: rep.points })),
				]),
			]);
		}
	}
}

const repCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const reputation: BotModule = {
	name: "reputation",
	commands: [repCommand],
	i18n: {
		"give.ok": "⭐ You gave a reputation point to {user}. They now have **{points}**.",
		"give.self": "You cannot give reputation to yourself.",
		"give.bot": "Bots do not collect reputation.",
		"give.cooldown": "You already gave reputation recently. Try again {when}.",
		"view.line": "⭐ {user} has **{points}** reputation.",
		"lb.title": "# ⭐ Reputation leaderboard",
		"lb.empty": "No reputation given yet. Be the first with `/rep give`.",
	},
};

export default reputation;
