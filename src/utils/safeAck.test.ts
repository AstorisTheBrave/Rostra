import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepliableInteraction } from "discord.js";
import { withSafeAck } from "./safeAck.ts";

function fakeInteraction(): RepliableInteraction & { deferCount: number } {
	const obj = {
		replied: false,
		deferred: false,
		deferCount: 0,
		async deferReply() {
			this.deferred = true;
			this.deferCount++;
		},
	};
	return obj as unknown as RepliableInteraction & { deferCount: number };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test("fast handlers are not auto-deferred", async () => {
	const i = fakeInteraction();
	await withSafeAck(
		i,
		async () => {
			(i as unknown as { replied: boolean }).replied = true;
		},
		{ deferAfterMs: 50 },
	);
	assert.equal(i.deferCount, 0);
});

test("slow handlers are auto-deferred once", async () => {
	const i = fakeInteraction();
	await withSafeAck(i, () => wait(40), { deferAfterMs: 10 });
	assert.equal(i.deferCount, 1);
	assert.equal(i.deferred, true);
});

test("already-acknowledged handlers are not double-deferred", async () => {
	const i = fakeInteraction();
	await withSafeAck(
		i,
		async () => {
			await i.deferReply();
			await wait(40);
		},
		{ deferAfterMs: 10 },
	);
	assert.equal(i.deferCount, 1);
});
