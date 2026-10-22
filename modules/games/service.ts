export type Mark = "X" | "O";
export type Cell = Mark | null;

const LINES = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6],
];

/** Returns the winning mark, "draw", or null if the tic-tac-toe game continues. */
export function checkTicTacToe(board: Cell[]): Mark | "draw" | null {
	for (const [a, b, c] of LINES) {
		const v = board[a as number];
		if (v && v === board[b as number] && v === board[c as number]) return v;
	}
	return board.every((cell) => cell !== null) ? "draw" : null;
}

export interface TttState {
	board: Cell[];
	turn: Mark;
	players: { X: string; O: string };
	finished: boolean;
}

const games = new Map<string, TttState>();

export function startTtt(token: string, challenger: string, opponent: string): TttState {
	const state: TttState = {
		board: Array<Cell>(9).fill(null),
		turn: "X",
		players: { X: challenger, O: opponent },
		finished: false,
	};
	games.set(token, state);
	setTimeout(() => games.delete(token), 10 * 60 * 1000);
	return state;
}

export function getTtt(token: string): TttState | undefined {
	return games.get(token);
}

export type Rps = "rock" | "paper" | "scissors";

/** Outcome from the player's perspective. */
export function rpsOutcome(player: Rps, opponent: Rps): "win" | "lose" | "draw" {
	if (player === opponent) return "draw";
	const beats: Record<Rps, Rps> = { rock: "scissors", paper: "rock", scissors: "paper" };
	return beats[player] === opponent ? "win" : "lose";
}

export function randomRps(): Rps {
	return (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)] ?? "rock";
}
