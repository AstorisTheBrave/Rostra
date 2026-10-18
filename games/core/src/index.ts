export type GameSessionState = "waiting" | "active" | "completed";

export interface GameResult {
	winnerId: string | null;
	reason: "completed" | "draw" | "cancelled";
}

export interface GameSession {
	id: string;
	gameId: string;
	guildId: string;
	players: readonly string[];
	state: GameSessionState;
	result?: GameResult;
}

export function isGameResult(value: unknown): value is GameResult {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		(candidate.winnerId === null || typeof candidate.winnerId === "string") &&
		["completed", "draw", "cancelled"].includes(String(candidate.reason))
	);
}

export function isGameSession(value: unknown): value is GameSession {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.gameId === "string" &&
		typeof candidate.guildId === "string" &&
		Array.isArray(candidate.players) &&
		candidate.players.length > 0 &&
		candidate.players.every((player) => typeof player === "string") &&
		["waiting", "active", "completed"].includes(String(candidate.state)) &&
		(candidate.result === undefined || isGameResult(candidate.result))
	);
}
