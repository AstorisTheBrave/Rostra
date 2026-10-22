import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScheduledTask } from "@rostra/database";
import {
	PermanentScheduledTaskError,
	type ScheduledFailureCode,
	type ScheduledTaskRepository,
} from "@rostra/operations";
import type { Client } from "discord.js";
import {
	GatewayScheduledTaskAdapter,
	ownsScheduledTask,
	registerTaskHandler,
} from "./scheduler.ts";

const client = {
	isReady: () => true,
	shard: { ids: [0] },
	guilds: { cache: new Map([["guild-1", {}]]) },
} as unknown as Client;

function harness(type: string) {
	let status = "claimed";
	let accepted = 0;
	let completed = 0;
	let failure: { code: ScheduledFailureCode; permanent: boolean } | undefined;
	let listener: (value: unknown) => void = () => {};
	const task = {
		id: "task-1",
		type,
		guildId: "guild-1",
		payload: {},
		claimVersion: 1,
	} as ScheduledTask;
	const store: ScheduledTaskRepository = {
		async schedule() {
			return task;
		},
		async cancel() {
			return "cancelled";
		},
		async claimDue() {
			return [];
		},
		async getClaim(id, version) {
			return id === task.id && version === 1 && status === "claimed" ? task : null;
		},
		async accept(id, version) {
			if (id !== task.id || version !== 1 || status !== "claimed") return false;
			status = "processing";
			accepted++;
			return true;
		},
		async deferPublication() {
			return false;
		},
		async complete() {
			completed++;
			status = "completed";
			return true;
		},
		async fail(_id, _version, code, permanent) {
			failure = { code, permanent };
			status = "failed";
			return true;
		},
	};
	const adapter = new GatewayScheduledTaskAdapter(client, store, (_channel, handler) => {
		listener = handler;
		return { ready: Promise.resolve({ status: "published" as const }), dispose() {} };
	});
	return {
		adapter,
		emit: (value: unknown) => listener(value),
		get accepted() {
			return accepted;
		},
		get completed() {
			return completed;
		},
		get failure() {
			return failure;
		},
	};
}

test("guild ownership and shard zero gate scheduled work", () => {
	assert.equal(ownsScheduledTask({ guildId: "guild-1" }, client), true);
	assert.equal(ownsScheduledTask({ guildId: "guild-2" }, client), false);
	assert.equal(ownsScheduledTask({ guildId: null }, client), true);
	assert.equal(
		ownsScheduledTask({ guildId: null }, { ...client, shard: { ids: [1] } } as Client),
		false,
	);
});

test("duplicate and stale bus messages accept a claim only once", async () => {
	let effects = 0;
	registerTaskHandler("test_duplicate", async () => {
		effects++;
	});
	const h = harness("test_duplicate");
	h.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	h.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	h.emit({ version: 1, taskId: "task-1", claimVersion: 0 });
	h.emit({ version: 1, taskId: "task-1", claimVersion: 2 });
	await h.adapter.close();
	assert.equal(h.accepted, 1);
	assert.equal(h.completed, 1);
	assert.equal(effects, 1);
});

test("unknown handler and malformed input retain permanent failure", async () => {
	const absent = harness("test_absent");
	absent.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	await absent.adapter.close();
	assert.deepEqual(absent.failure, { code: "unknown_handler", permanent: true });

	registerTaskHandler("test_invalid", () => {
		throw new PermanentScheduledTaskError();
	});
	const invalid = harness("test_invalid");
	invalid.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	await invalid.adapter.close();
	assert.deepEqual(invalid.failure, { code: "invalid_payload", permanent: true });
});

test("shutdown waits for accepted handler and refuses later messages", async () => {
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	registerTaskHandler("test_drain", async () => gate);
	const h = harness("test_drain");
	h.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	let drained = false;
	const closing = h.adapter.close().then(() => {
		drained = true;
	});
	h.emit({ version: 1, taskId: "task-1", claimVersion: 1 });
	assert.equal(drained, false);
	release();
	await closing;
	assert.equal(h.completed, 1);
});
