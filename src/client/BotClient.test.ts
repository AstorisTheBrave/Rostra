import assert from "node:assert/strict";
import { test } from "node:test";
import { GatewayIntentBits } from "discord.js";

test("BotClient initializes empty registries and core intents", async () => {
	const { BotClient } = await import("./BotClient.ts");
	const client = new BotClient();
	assert.equal(client.commands.size, 0);
	assert.equal(client.components.length, 0);
	assert.equal(client.options.intents.has(GatewayIntentBits.Guilds), true);
	assert.equal(client.options.intents.has(GatewayIntentBits.GuildVoiceStates), true);
});

test("defineEvent produces a uniform RegisteredEvent", async () => {
	const { defineEvent } = await import("./defineEvent.ts");
	const ev = defineEvent("ready", { once: true, execute: () => {} });
	assert.equal(ev.name, "ready");
	assert.equal(ev.once, true);
	assert.equal(typeof ev.register, "function");
});
