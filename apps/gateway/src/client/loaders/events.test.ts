import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { BotClient } from "../BotClient.ts";
import { defineEvent } from "../defineEvent.ts";
import { registerEvents } from "./events.ts";

test("repeated event registration replaces listeners and disposal removes them", async () => {
	const client = new BotClient();
	let calls = 0;
	const event = defineEvent("messageCreate", {
		execute: () => {
			calls++;
		},
	});
	const module = { name: "example", events: [event] };
	try {
		const firstDispose = registerEvents(client, [module]);
		const secondDispose = registerEvents(client, [module]);
		assert.equal(client.listenerCount("messageCreate"), 1);
		Reflect.apply(EventEmitter.prototype.emit, client, ["messageCreate", {}]);
		assert.equal(calls, 1);
		firstDispose();
		assert.equal(client.listenerCount("messageCreate"), 1);
		secondDispose();
		assert.equal(client.listenerCount("messageCreate"), 0);
	} finally {
		await client.destroy();
	}
});
