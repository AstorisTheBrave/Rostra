import type { TriviaScore } from "@prisma/client";
import { getRedis } from "@/services/cache.ts";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

const log = getLogger("trivia");

export interface TriviaQuestion {
	question: string;
	category: string;
	difficulty: string;
	correct: string;
	incorrect: string[];
}

export interface TriviaOptions {
	options: string[];
	correctIndex: number;
}

interface OtdbResponse {
	response_code: number;
	results: {
		category: string;
		difficulty: string;
		question: string;
		correct_answer: string;
		incorrect_answers: string[];
	}[];
}

const decode = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

/** Fetch one multiple-choice question from the Open Trivia DB (URL-encoded). */
export async function fetchQuestion(): Promise<TriviaQuestion | null> {
	try {
		const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986");
		if (!res.ok) return null;
		const data = (await res.json()) as OtdbResponse;
		const row = data.results[0];
		if (data.response_code !== 0 || !row) return null;
		return {
			question: decode(row.question),
			category: decode(row.category),
			difficulty: decode(row.difficulty),
			correct: decode(row.correct_answer),
			incorrect: row.incorrect_answers.map(decode),
		};
	} catch (err) {
		log.error({ err }, "failed to fetch trivia question");
		return null;
	}
}

/** Shuffle the answers and report which index holds the correct one. */
export function buildOptions(correct: string, incorrect: string[]): TriviaOptions {
	const options = [correct, ...incorrect];
	for (let i = options.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = options[i];
		const b = options[j];
		if (a !== undefined && b !== undefined) {
			options[i] = b;
			options[j] = a;
		}
	}
	return { options, correctIndex: options.indexOf(correct) };
}

// ── Active sessions (in-memory, per shard — the message lives on this shard) ──

export interface TriviaSession {
	correctIndex: number;
	options: string[];
	answered: Set<string>;
	correct: string;
}

const sessions = new Map<string, TriviaSession>();

export function startSession(token: string, session: TriviaSession): void {
	sessions.set(token, session);
	setTimeout(() => sessions.delete(token), 60_000);
}

export function getSession(token: string): TriviaSession | undefined {
	return sessions.get(token);
}

// ── Scores ───────────────────────────────────────────────────────────────────

export async function recordAnswer(
	guildId: string,
	userId: string,
	correct: boolean,
): Promise<void> {
	const score = await getPrisma().triviaScore.upsert({
		where: { guildId_userId: { guildId, userId } },
		create: { guildId, userId, correct: correct ? 1 : 0, total: 1 },
		update: { correct: { increment: correct ? 1 : 0 }, total: { increment: 1 } },
	});
	const redis = getRedis();
	if (redis) await redis.zadd(`lb:trivia:${guildId}`, score.correct, userId).catch(() => {});
}

export async function getScore(guildId: string, userId: string): Promise<TriviaScore | null> {
	return getPrisma().triviaScore.findUnique({ where: { guildId_userId: { guildId, userId } } });
}

export interface TriviaEntry {
	userId: string;
	correct: number;
}

export async function leaderboard(guildId: string, limit = 10): Promise<TriviaEntry[]> {
	const redis = getRedis();
	if (redis) {
		const rows = await redis
			.zrevrange(`lb:trivia:${guildId}`, 0, limit - 1, "WITHSCORES")
			.catch(() => [] as string[]);
		if (rows.length) {
			const entries: TriviaEntry[] = [];
			for (let i = 0; i < rows.length; i += 2) {
				entries.push({ userId: rows[i] ?? "", correct: Number(rows[i + 1] ?? 0) });
			}
			return entries;
		}
	}
	const scores = await getPrisma().triviaScore.findMany({
		where: { guildId },
		orderBy: { correct: "desc" },
		take: limit,
	});
	return scores.map((s) => ({ userId: s.userId, correct: s.correct }));
}
