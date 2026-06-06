import type { Prisma, ScheduledTask } from "@prisma/client";
import type { Client } from "discord.js";
import { getPrisma } from "@/services/database.ts";
import { getLogger } from "@/services/logger.ts";

/**
 * Durable, crash-safe scheduler. Future actions are rows in `ScheduledTask`, so
 * they survive restarts; each shard re-arms the tasks it owns on boot. Modules
 * register a handler per task `type` and call `schedule(...)`; on fire the row is
 * dispatched to its handler and deleted.
 *
 * Guild-bound tasks run on the guild's owning shard. Global tasks (`guildId:
 * null`) run only on shard 0 to avoid duplicate firing across the cluster.
 */

const log = getLogger("scheduler");
const MAX_TIMEOUT = 2_147_483_000;
const timers = new Map<string, NodeJS.Timeout>();

export type TaskHandler = (payload: unknown, client: Client) => Promise<void> | void;
const handlers = new Map<string, TaskHandler>();

/** Register the handler that runs when a task of `type` fires. */
export function registerTaskHandler(type: string, handler: TaskHandler): void {
	handlers.set(type, handler);
}

/** Clamp a delay to setTimeout's safe max (re-armed for longer waits). */
export function clampDelay(ms: number): number {
	return Math.min(Math.max(0, ms), MAX_TIMEOUT);
}

/** Whether this shard is responsible for arming a given task. */
export function shouldArm(
	task: Pick<ScheduledTask, "guildId">,
	shardId: number,
	ownsGuild: (guildId: string) => boolean,
): boolean {
	if (task.guildId === null) return shardId === 0;
	return ownsGuild(task.guildId);
}

function arm(client: Client, task: ScheduledTask): void {
	const existing = timers.get(task.id);
	if (existing) clearTimeout(existing);
	const delay = task.runAt.getTime() - Date.now();
	if (delay <= 0) {
		void fire(client, task.id);
		return;
	}
	const timer = setTimeout(() => {
		void getPrisma()
			.scheduledTask.findUnique({ where: { id: task.id } })
			.then((fresh) => {
				if (!fresh) return;
				if (fresh.runAt.getTime() <= Date.now()) void fire(client, task.id);
				else arm(client, fresh);
			});
	}, clampDelay(delay));
	timers.set(task.id, timer);
}

async function fire(client: Client, id: string): Promise<void> {
	timers.delete(id);
	const task = await getPrisma().scheduledTask.findUnique({ where: { id } });
	if (!task) return;
	const handler = handlers.get(task.type);
	if (handler) {
		try {
			await handler(task.payload, client);
		} catch (err) {
			log.error({ err, type: task.type, id }, "scheduled task handler failed");
		}
	} else {
		log.warn({ type: task.type, id }, "no handler registered for scheduled task type");
	}
	await getPrisma().scheduledTask.deleteMany({ where: { id } });
}

/** Create a durable task and arm it on this shard if it owns it. */
export async function schedule(
	input: { type: string; runAt: Date; guildId?: string | null; payload?: Prisma.InputJsonValue },
	client?: Client,
): Promise<ScheduledTask> {
	const task = await getPrisma().scheduledTask.create({
		data: {
			type: input.type,
			runAt: input.runAt,
			guildId: input.guildId ?? null,
			payload: input.payload ?? {},
		},
	});
	if (client) arm(client, task);
	return task;
}

/** Cancel a task: clear its local timer and delete the row. */
export async function cancelTask(id: string): Promise<void> {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	await getPrisma().scheduledTask.deleteMany({ where: { id } });
}

/** On boot, re-arm every pending task this shard is responsible for. */
export async function recoverScheduled(client: Client): Promise<number> {
	const shardId = client.shard?.ids[0] ?? 0;
	const pending = await getPrisma().scheduledTask.findMany();
	let armed = 0;
	for (const task of pending) {
		if (shouldArm(task, shardId, (g) => client.guilds.cache.has(g))) {
			arm(client, task);
			armed++;
		}
	}
	log.info({ armed, total: pending.length }, "recovered scheduled tasks");
	return armed;
}
