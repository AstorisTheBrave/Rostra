import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepliableInteraction } from "discord.js";
import { withSafeAck } from "./safeAck.ts";

interface FakeInteraction {
	replied: boolean;
	deferred: boolean;
	deferCount: number;
	editCount: number;
	deferReply(): Promise<void>;
	editReply(): Promise<void>;
}

function fakeInteraction(): FakeInteraction {
	return {
		replied: false,
		deferred: false,
		deferCount: 0,
		editCount: 0,
		async deferReply() {
			this.deferred = true;
			this.deferCount++;
		},
		async editReply() {
			this.editCount++;
		},
	};
}

const as = (i: FakeInteraction): RepliableInteraction => i as unknown as RepliableInteraction;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test("fast handlers are not auto-deferred", async () => {
	const i = fakeInteraction();
	await withSafeAck(
		as(i),
		async () => {
			i.replied = true;
		},
		{ deferAfterMs: 50 },
	);
	assert.equal(i.deferCount, 0);
});

test("slow handlers are auto-deferred once", async () => {
	const i = fakeInteraction();
	await withSafeAck(as(i), () => wait(40), { deferAfterMs: 10 });
	assert.equal(i.deferCount, 1);
	assert.equal(i.deferred, true);
});

test("already-acknowledged handlers are not double-deferred", async () => {
	const i = fakeInteraction();
	await withSafeAck(
		as(i),
		async () => {
			await i.deferReply();
			await wait(40);
		},
		{ deferAfterMs: 10 },
	);
	assert.equal(i.deferCount, 1);
});

test("heartbeat edits the reply while a long handler runs", async () => {
	const i = fakeInteraction();
	await withSafeAck(as(i), () => wait(70), {
		deferAfterMs: 5,
		heartbeat: true,
		heartbeatMs: 20,
	});
	assert.equal(i.deferCount, 1);
	assert.ok(i.editCount >= 1, "expected at least one heartbeat edit");
});

test("heartbeat does not fire for fast handlers", async () => {
	const i = fakeInteraction();
	await withSafeAck(
		as(i),
		async () => {
			i.replied = true;
		},
		{ deferAfterMs: 50, heartbeat: true, heartbeatMs: 20 },
	);
	assert.equal(i.editCount, 0);
});
