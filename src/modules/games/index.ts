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
	checkTicTacToe,
	getTtt,
	type Rps,
	randomRps,
	rpsOutcome,
	startTtt,
	type TttState,
} from "./service.ts";

const CELL_EMOJI = { X: "❌", O: "⭕", empty: "⬜" } as const;

function renderTtt(token: string, state: TttState) {
	const result = checkTicTacToe(state.board);
	let status: string;
	if (result === "draw") status = "🤝 It's a draw!";
	else if (result) status = `🎉 <@${state.players[result]}> wins!`;
	else status = `<@${state.players[state.turn]}>'s turn (${CELL_EMOJI[state.turn]})`;

	const rows = [];
	for (let r = 0; r < 3; r++) {
		const cells = [];
		for (let c = 0; c < 3; c++) {
			const i = r * 3 + c;
			const mark = state.board[i];
			cells.push(
				button({
					id: `game:ttt:${token}:${i}`,
					emoji: mark ? CELL_EMOJI[mark] : CELL_EMOJI.empty,
					style: mark ? ButtonStyle.Secondary : ButtonStyle.Primary,
					disabled: state.finished || mark !== null,
				}),
			);
		}
		rows.push(actionRow(...cells));
	}
	return [container(Accent.info, [text("# ⭕ Tic-Tac-Toe"), text(status)]), ...rows];
}

function rpsRow() {
	return actionRow(
		button({ id: "game:rps:rock", label: "Rock", emoji: "🪨", style: ButtonStyle.Secondary }),
		button({ id: "game:rps:paper", label: "Paper", emoji: "📄", style: ButtonStyle.Secondary }),
		button({
			id: "game:rps:scissors",
			label: "Scissors",
			emoji: "✂️",
			style: ButtonStyle.Secondary,
		}),
	);
}

function buildData(): SlashCommandBuilder {
	const cmd = new SlashCommandBuilder().setName("game").setDescription("Mini-games");
	cmd.addSubcommand((s) =>
		s
			.setName("tictactoe")
			.setDescription("Challenge someone to tic-tac-toe")
			.addUserOption((o) =>
				o.setName("opponent").setDescription("Who to play against").setRequired(true),
			),
	);
	cmd.addSubcommand((s) => s.setName("rps").setDescription("Play rock-paper-scissors vs the bot"));
	return cmd;
}

async function execute({
	interaction,
}: {
	interaction: ChatInputCommandInteraction;
	client: BotClient;
}): Promise<void> {
	if (!interaction.guild) return void reply.error(interaction, t("common:error.guildOnly"));
	const sub = interaction.options.getSubcommand();

	if (sub === "tictactoe") {
		const opponent = interaction.options.getUser("opponent", true);
		if (opponent.bot || opponent.id === interaction.user.id) {
			return void reply.error(interaction, t("games:ttt.badOpponent"));
		}
		const token = randomUUID().slice(0, 8);
		const state = startTtt(token, interaction.user.id, opponent.id);
		await interaction.reply({
			components: renderTtt(token, state),
			flags: MessageFlags.IsComponentsV2,
		});
		return;
	}

	// rps
	await interaction.reply({
		components: [container(Accent.info, [text(t("games:rps.prompt"))]), rpsRow()],
		flags: MessageFlags.IsComponentsV2,
	});
}

const gameComponent: ComponentHandler = {
	prefix: "game",
	execute: async (interaction, args) => {
		if (!interaction.isButton()) return;

		if (args[0] === "rps") {
			const choice = args[1] as Rps | undefined;
			if (!choice) return;
			const botChoice = randomRps();
			const outcome = rpsOutcome(choice, botChoice);
			const key =
				outcome === "win"
					? "games:rps.win"
					: outcome === "lose"
						? "games:rps.lose"
						: "games:rps.draw";
			await interaction.reply({
				components: [
					container(
						outcome === "win" ? Accent.success : outcome === "lose" ? Accent.error : Accent.info,
						[text(t(key, { player: choice, bot: botChoice }))],
					),
				],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
			return;
		}

		if (args[0] === "ttt") {
			const token = args[1];
			const cell = Number(args[2]);
			if (!token || Number.isNaN(cell)) return;
			const state = getTtt(token);
			if (!state || state.finished) return void reply.error(interaction, t("games:ttt.over"));
			if (interaction.user.id !== state.players[state.turn]) {
				return void reply.error(interaction, t("games:ttt.notYourTurn"));
			}
			if (state.board[cell] !== null) return;
			state.board[cell] = state.turn;
			const result = checkTicTacToe(state.board);
			if (result) state.finished = true;
			else state.turn = state.turn === "X" ? "O" : "X";
			await interaction.update({
				components: renderTtt(token, state),
				flags: MessageFlags.IsComponentsV2,
			});
		}
	},
};

const gameCommand: SlashCommand = {
	data: buildData(),
	guildOnly: true,
	execute,
};

const games: BotModule = {
	name: "games",
	commands: [gameCommand],
	components: [gameComponent],
	i18n: {
		"ttt.badOpponent": "Pick a real opponent (not yourself or a bot).",
		"ttt.over": "That game has ended.",
		"ttt.notYourTurn": "It's not your turn.",
		"rps.prompt": "# ✊ Rock-Paper-Scissors\nPick your move:",
		"rps.win": "🎉 You won! **{player}** beats **{bot}**.",
		"rps.lose": "😢 You lost - **{bot}** beats **{player}**.",
		"rps.draw": "🤝 Draw! You both picked **{player}**.",
	},
};

export default games;
