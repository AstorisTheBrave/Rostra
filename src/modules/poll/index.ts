import {
	ButtonStyle,
	type ChatInputCommandInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { t } from "@/i18n/index.ts";
import type { BotModule, ComponentHandler, SlashCommand } from "@/types/module.ts";
import { Accent, actionRow, button, container, reply, text } from "@/ui";
import {
	castVote,
	closePoll,
	createPoll,
	type PollResult,
	resultBar,
	setMessageId,
	tally,
} from "./service.ts";

const MAX_OPTIONS = 5;

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("poll").setDescription("Create a button poll");
	cmd.addSubcommand((s) => {
		s.setName("create")
			.setDescription("Start a poll")
			.addStringOption((o) =>
				o.setName("question").setDescription("The poll question").setRequired(true),
			)
			.addStringOption((o) => o.setName("option1").setDescription("Option 1").setRequired(true))
			.addStringOption((o) => o.setName("option2").setDescription("Option 2").setRequired(true));
		for (let i = 3; i <= MAX_OPTIONS; i++) {
			s.addStringOption((o) => o.setName(`option${i}`).setDescription(`Option ${i}`));
		}
		return s;
	});
	return cmd;
}

/** Build the Components V2 message for a poll (buttons omitted once closed). */
function renderPoll(pollId: string, r: PollResult) {
	const lines = r.options.map(
		(opt, i) => `**${i + 1}. ${opt}**\n${resultBar(r.counts[i] ?? 0, r.total)}`,
	);
	const header = r.closed ? `# 📊 ${r.question}\n_Poll closed_` : `# 📊 ${r.question}`;
	const components: ReturnType<typeof container>[] = [
		container(r.closed ? Accent.info : Accent.warn, [
			text(header),
			text(lines.join("\n\n")),
			text(`_${r.total} vote${r.total === 1 ? "" : "s"}_`),
		]),
	];
	if (r.closed) return components;

	const voteButtons = r.options.map((opt, i) =>
		button({
			id: `poll:vote:${pollId}:${i}`,
			label: `${i + 1}. ${opt}`.slice(0, 80),
			style: ButtonStyle.Secondary,
		}),
	);
	// Up to 5 option buttons fit in one row; the end button goes on its own row.
	const rows: ReturnType<typeof actionRow>[] = [];
	for (let i = 0; i < voteButtons.length; i += 5) {
		rows.push(actionRow(...voteButtons.slice(i, i + 5)));
	}
	rows.push(
		actionRow(
			button({
				id: `poll:end:${pollId}`,
				label: "End poll",
				emoji: "🔒",
				style: ButtonStyle.Danger,
			}),
		),
	);
	return [...components, ...rows];
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return void reply.error(interaction, t("common:error.guildOnly"));

	const question = interaction.options.getString("question", true);
	const options: string[] = [];
	for (let i = 1; i <= MAX_OPTIONS; i++) {
		const opt = interaction.options.getString(`option${i}`);
		if (opt) options.push(opt.slice(0, 80));
	}
	if (options.length < 2) return void reply.error(interaction, t("poll:needOptions"));

	const poll = await createPoll({
		guildId: guild.id,
		channelId: interaction.channelId,
		creatorId: interaction.user.id,
		question,
		options,
	});
	const result: PollResult = {
		question,
		options,
		counts: options.map(() => 0),
		total: 0,
		closed: false,
	};
	await interaction.reply({
		components: renderPoll(poll.id, result),
		flags: MessageFlags.IsComponentsV2,
	});
	const msg = await interaction.fetchReply().catch(() => null);
	if (msg) await setMessageId(poll.id, msg.id);
}

const pollComponent: ComponentHandler = {
	prefix: "poll",
	execute: async (interaction, args) => {
		if (!interaction.isButton()) return;
		const [action, pollId, choiceStr] = args;
		if (!pollId) return;

		if (action === "vote") {
			const ok = await castVote(pollId, interaction.user.id, Number(choiceStr));
			if (!ok) {
				await interaction.reply({ content: t("poll:voteFailed"), flags: MessageFlags.Ephemeral });
				return;
			}
			const r = await tally(pollId);
			if (r) {
				await interaction.update({
					components: renderPoll(pollId, r),
					flags: MessageFlags.IsComponentsV2,
				});
			}
			return;
		}
		if (action === "end") {
			const closed = await closePoll(pollId, interaction.user.id);
			if (!closed) {
				await interaction.reply({ content: t("poll:onlyCreator"), flags: MessageFlags.Ephemeral });
				return;
			}
			const r = await tally(pollId);
			if (r) {
				await interaction.update({
					components: renderPoll(pollId, r),
					flags: MessageFlags.IsComponentsV2,
				});
			}
		}
	},
};

const poll: BotModule = {
	name: "poll",
	commands: [{ data: buildData(), guildOnly: true, execute } satisfies SlashCommand],
	components: [pollComponent],
	i18n: {
		needOptions: "A poll needs at least two options.",
		voteFailed: "This poll is closed or no longer available.",
		onlyCreator: "Only the poll's creator can end it.",
	},
};

export default poll;
