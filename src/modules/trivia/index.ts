import { randomUUID } from "node:crypto";
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
	buildOptions,
	fetchQuestion,
	getScore,
	getSession,
	leaderboard,
	recordAnswer,
	startSession,
} from "./service.ts";

const LETTERS = ["🇦", "🇧", "🇨", "🇩"];

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("trivia").setDescription("Trivia quiz game");
	cmd.addSubcommand((s) => s.setName("play").setDescription("Start a trivia question"));
	cmd.addSubcommand((s) =>
		s
			.setName("score")
			.setDescription("Show a player's trivia score")
			.addUserOption((o) => o.setName("user").setDescription("User (defaults to you)")),
	);
	cmd.addSubcommand((s) => s.setName("leaderboard").setDescription("Top trivia players"));
	return cmd;
}

async function play(interaction: ChatInputCommandInteraction): Promise<void> {
	const question = await fetchQuestion();
	if (!question) return void reply.error(interaction, t("trivia:error.fetch"));

	const { options, correctIndex } = buildOptions(question.correct, question.incorrect);
	const token = randomUUID().slice(0, 8);
	startSession(token, { correctIndex, options, answered: new Set(), correct: question.correct });

	const row = actionRow(
		...options.map((option, i) =>
			button({
				id: `trivia:answer:${token}:${i}`,
				label: `${option}`.slice(0, 80),
				emoji: LETTERS[i] ?? "❓",
				style: ButtonStyle.Secondary,
			}),
		),
	);

	await interaction.reply({
		components: [
			container(Accent.info, [
				text(`# 🧠 Trivia - ${question.category}`),
				text(`*${question.difficulty}*\n\n**${question.question}**`),
			]),
			row,
		],
		flags: MessageFlags.IsComponentsV2,
	});
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

	if (sub === "play") return play(interaction);

	if (sub === "score") {
		const user = interaction.options.getUser("user") ?? interaction.user;
		const score = await getScore(guild.id, user.id);
		const correct = score?.correct ?? 0;
		const total = score?.total ?? 0;
		const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
		return void reply.components(interaction, [
			container(Accent.info, [
				text(`# 🧠 ${user.username}'s trivia`),
				text(t("trivia:score", { correct, total, accuracy })),
			]),
		]);
	}

	// leaderboard
	const top = await leaderboard(guild.id, 10);
	if (top.length === 0)
		return void reply.components(interaction, [
			container(Accent.info, [text(t("trivia:leaderboard.empty"))]),
		]);
	const medals = ["🥇", "🥈", "🥉"];
	const lines = top.map(
		(e, i) => `${medals[i] ?? `\`#${i + 1}\``} <@${e.userId}> - **${e.correct}** correct`,
	);
	await reply.components(interaction, [
		container(Accent.info, [text(t("trivia:leaderboard.title")), text(lines.join("\n"))]),
	]);
}

const triviaComponent: ComponentHandler = {
	prefix: "trivia",
	deferEphemeral: true,
	execute: async (interaction, args) => {
		if (args[0] !== "answer" || !interaction.isButton() || !interaction.guild) return;
		const token = args[1];
		const index = Number(args[2]);
		if (!token || Number.isNaN(index)) return;
		const session = getSession(token);
		if (!session) return void reply.error(interaction, t("trivia:error.expired"));
		if (session.answered.has(interaction.user.id)) {
			return void reply.error(interaction, t("trivia:error.already"));
		}
		session.answered.add(interaction.user.id);
		const correct = index === session.correctIndex;
		await recordAnswer(interaction.guild.id, interaction.user.id, correct);
		await reply.components(
			interaction,
			[
				container(correct ? Accent.success : Accent.error, [
					text(
						correct
							? t("trivia:correct")
							: t("trivia:wrong", { answer: session.options[session.correctIndex] ?? "?" }),
					),
				]),
			],
			true,
		);
	},
};

const triviaCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const trivia: BotModule = {
	name: "trivia",
	commands: [triviaCommand],
	components: [triviaComponent],
	i18n: {
		score: "**Correct:** {correct}\n**Answered:** {total}\n**Accuracy:** {accuracy}%",
		correct: "✅ Correct! Nice one.",
		wrong: "❌ Not quite - the answer was **{answer}**.",
		"leaderboard.title": "# 🧠 Trivia leaderboard",
		"leaderboard.empty": "No one has played trivia yet.",
		"error.fetch": "Couldn't fetch a question right now. Try again shortly.",
		"error.expired": "That round has expired.",
		"error.already": "You already answered this one!",
	},
};

export default trivia;
