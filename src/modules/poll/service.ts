import type { Poll } from "@prisma/client";
import { getPrisma } from "@/services/database.ts";

export interface PollResult {
	question: string;
	options: string[];
	counts: number[];
	total: number;
	closed: boolean;
}

export async function createPoll(data: {
	guildId: string;
	channelId: string;
	creatorId: string;
	question: string;
	options: string[];
}): Promise<Poll> {
	return getPrisma().poll.create({ data });
}

export async function setMessageId(pollId: string, messageId: string): Promise<void> {
	await getPrisma().poll.update({ where: { id: pollId }, data: { messageId } });
}

export function getPoll(pollId: string): Promise<Poll | null> {
	return getPrisma().poll.findUnique({ where: { id: pollId } });
}

/** Record (or change) a user's vote. No-op if the poll is closed. Returns false if closed/missing. */
export async function castVote(pollId: string, userId: string, choice: number): Promise<boolean> {
	const poll = await getPrisma().poll.findUnique({ where: { id: pollId } });
	if (!poll || poll.closed || choice < 0 || choice >= poll.options.length) return false;
	await getPrisma().pollVote.upsert({
		where: { pollId_userId: { pollId, userId } },
		create: { pollId, userId, choice },
		update: { choice },
	});
	return true;
}

export async function closePoll(pollId: string, byUserId: string): Promise<boolean> {
	const poll = await getPrisma().poll.findUnique({ where: { id: pollId } });
	if (!poll || poll.closed || poll.creatorId !== byUserId) return false;
	await getPrisma().poll.update({ where: { id: pollId }, data: { closed: true } });
	return true;
}

/** Tally the current results of a poll. */
export async function tally(pollId: string): Promise<PollResult | null> {
	const poll = await getPrisma().poll.findUnique({
		where: { id: pollId },
		include: { votes: true },
	});
	if (!poll) return null;
	const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.choice === i).length);
	return {
		question: poll.question,
		options: poll.options,
		counts,
		total: poll.votes.length,
		closed: poll.closed,
	};
}

/** Build a text bar for a single option's share of the vote. */
export function resultBar(count: number, total: number, size = 12): string {
	const ratio = total > 0 ? count / total : 0;
	const filled = Math.round(ratio * size);
	const pct = Math.round(ratio * 100);
	return `${"█".repeat(filled)}${"░".repeat(Math.max(0, size - filled))} ${count} (${pct}%)`;
}
