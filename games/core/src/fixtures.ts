import type { GameSession } from "./index.ts";

export const waitingSession = {
	id: "session-waiting",
	gameId: "fixture",
	guildId: "guild-1",
	players: ["user-1", "user-2"],
	state: "waiting",
} as const satisfies GameSession;

export const completedSession = {
	...waitingSession,
	id: "session-completed",
	state: "completed",
	result: { winnerId: "user-1", reason: "completed" },
} as const satisfies GameSession;
