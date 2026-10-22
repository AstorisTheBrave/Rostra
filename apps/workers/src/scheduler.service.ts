import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { config } from "@rostra/config";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import {
	PrismaScheduledTaskRepository,
	parseScheduledTaskDispatch,
	SCHEDULED_TASK_CHANNEL,
} from "@rostra/operations";
import Redis from "ioredis";
import { ScheduledTaskPublisher } from "./runtime.ts";

const childPath = fileURLToPath(new URL("./scheduler-process-child.ts", import.meta.url));

async function runChild(mode: string, id?: string) {
	const child = spawn(process.execPath, ["--import", "tsx", childPath, mode, ...(id ? [id] : [])], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	const output = mode === "hold" ? "HELD" : "PUBLISHED";
	let text = "";
	let stderr = "";
	await new Promise<void>((resolve, reject) => {
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			text += chunk.toString();
			if (text.includes(output)) resolve();
		});
		child.once("error", reject);
		child.once("exit", (code) => {
			if (!text.includes(output))
				reject(new Error(`worker exited before ${output}: ${code}\n${stderr}`));
		});
	});
	return child;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() >= deadline) throw new Error("scheduled task recovery timed out");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

test("killed worker leases recover repeatedly with one idempotent durable effect", async () => {
	assert.ok(config.redis.url, "REDIS_URL is required for service integration");
	const repository = new PrismaScheduledTaskRepository();
	const prisma = getPrisma();
	const ids: string[] = [];
	const keys: string[] = [];
	const tasks = new Set<Promise<void>>();
	const subscriber = new Redis(config.redis.url, { maxRetriesPerRequest: null });
	subscriber.on("error", () => {});
	const publisher = new ScheduledTaskPublisher(config.redis.url);
	subscriber.on("message", (_channel, message) => {
		let value: unknown;
		try {
			value = JSON.parse(message);
		} catch {
			return;
		}
		const envelope = parseScheduledTaskDispatch(value);
		if (!envelope) return;
		const work = (async () => {
			const task = await repository.getClaim(envelope.taskId, envelope.claimVersion, new Date());
			if (!task || !(await repository.accept(task.id, envelope.claimVersion, new Date()))) return;
			const key = `scheduler-effect-${task.id}`;
			await prisma.botState.upsert({
				where: { key },
				create: { key, value: "once" },
				update: { value: "duplicate" },
			});
			await repository.complete(task.id, envelope.claimVersion);
		})();
		tasks.add(work);
		void work.finally(() => tasks.delete(work));
	});
	try {
		await subscriber.subscribe(SCHEDULED_TASK_CHANNEL);
		for (let round = 0; round < 3; round++) {
			const task = await repository.schedule({ type: "service-test", runAt: new Date() });
			ids.push(task.id);
			const key = `scheduler-effect-${task.id}`;
			keys.push(key);
			const first = await runChild("hold", task.id);
			first.kill("SIGKILL");
			await once(first, "exit");
			await new Promise((resolve) => setTimeout(resolve, 1_600));
			const replacement = await runChild("replace");
			await once(replacement, "exit");
			await waitFor(
				async () =>
					(await prisma.scheduledTask.findUnique({ where: { id: task.id } }))?.status ===
					"completed",
			);
			const completed = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: task.id } });
			assert.equal(completed.claimVersion, 2);
			assert.equal((await prisma.botState.findUniqueOrThrow({ where: { key } })).value, "once");
			await publisher.publish(SCHEDULED_TASK_CHANNEL, {
				version: 1,
				taskId: task.id,
				claimVersion: 1,
			});
			await publisher.publish(SCHEDULED_TASK_CHANNEL, {
				version: 1,
				taskId: task.id,
				claimVersion: 2,
			});
			await Promise.all(tasks);
			assert.equal((await prisma.botState.findUniqueOrThrow({ where: { key } })).value, "once");
		}
	} finally {
		subscriber.disconnect();
		await publisher.close();
		await Promise.allSettled([...tasks]);
		await prisma.botState.deleteMany({ where: { key: { in: keys } } });
		await prisma.scheduledTask.deleteMany({ where: { id: { in: ids } } });
		await disconnectPrisma();
	}
});
