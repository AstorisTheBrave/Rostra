import { subscribe } from "@rostra/cache/bus";
import type { Prisma, ScheduledTask } from "@rostra/database";
import { getLogger } from "@rostra/logger";
import {
	PermanentScheduledTaskError,
	PrismaScheduledTaskRepository,
	parseScheduledTaskDispatch,
	SCHEDULED_TASK_CHANNEL,
	type ScheduledTaskRepository,
} from "@rostra/operations";
import { type Client, DiscordAPIError } from "discord.js";

const log = getLogger("scheduler");
const repository = new PrismaScheduledTaskRepository();
export type TaskHandler = (
	payload: unknown,
	client: Client,
	guildId: string | null,
) => Promise<void> | void;
const handlers = new Map<string, TaskHandler>();

export function registerTaskHandler(type: string, handler: TaskHandler): void {
	handlers.set(type, handler);
}

export function isAbsentDiscordError(error: unknown, code: number): boolean {
	return error instanceof DiscordAPIError && error.code === code;
}

export async function schedule(input: {
	type: string;
	runAt: Date;
	guildId?: string | null;
	payload?: Prisma.InputJsonValue;
}): Promise<ScheduledTask> {
	return repository.schedule(input);
}

export async function cancelTask(
	id: string,
): Promise<"cancelled" | "processing" | "terminal" | "missing"> {
	return repository.cancel(id);
}

export function ownsScheduledTask(
	task: Pick<ScheduledTask, "guildId">,
	client: Pick<Client, "guilds" | "shard" | "isReady">,
): boolean {
	if (!client.isReady()) return false;
	if (task.guildId === null) return client.shard?.ids.includes(0) ?? true;
	return client.guilds.cache.has(task.guildId);
}

export class GatewayScheduledTaskAdapter {
	readonly #client: Client;
	readonly #repository: ScheduledTaskRepository;
	readonly #running = new Set<Promise<void>>();
	readonly #subscription: ReturnType<typeof subscribe>;
	#closing = false;

	constructor(
		client: Client,
		store: ScheduledTaskRepository = repository,
		subscribeToBus = subscribe,
	) {
		this.#client = client;
		this.#repository = store;
		this.#subscription = subscribeToBus(SCHEDULED_TASK_CHANNEL, (value) => {
			if (this.#closing) return;
			const message = parseScheduledTaskDispatch(value);
			if (!message) {
				log.warn("invalid scheduled task dispatch ignored");
				return;
			}
			const work = this.#dispatch(message.taskId, message.claimVersion);
			this.#running.add(work);
			void work.finally(() => this.#running.delete(work));
		});
		void this.#subscription.ready.then((outcome) => {
			if (outcome.status !== "published")
				log.warn({ reason: outcome.reason }, "scheduled task subscription unavailable");
		});
	}

	async #dispatch(id: string, claimVersion: number): Promise<void> {
		try {
			const task = await this.#repository.getClaim(id, claimVersion, new Date());
			if (!task || !ownsScheduledTask(task, this.#client)) return;
			if (!(await this.#repository.accept(id, claimVersion, new Date()))) return;
			const handler = handlers.get(task.type);
			if (!handler) {
				await this.#repository.fail(id, claimVersion, "unknown_handler", true, new Date());
				return;
			}
			try {
				await handler(task.payload, this.#client, task.guildId);
				await this.#repository.complete(id, claimVersion);
			} catch (error) {
				const permanent = error instanceof PermanentScheduledTaskError;
				await this.#repository.fail(
					id,
					claimVersion,
					permanent ? "invalid_payload" : "handler_failed",
					permanent,
					new Date(),
				);
				if (!permanent)
					log.error({ err: error, id, type: task.type }, "scheduled task handler failed");
			}
		} catch (error) {
			log.error({ err: error, id }, "scheduled task dispatch failed");
		}
	}

	async close(): Promise<void> {
		this.#closing = true;
		this.#subscription.dispose();
		await Promise.all(this.#running);
	}
}
