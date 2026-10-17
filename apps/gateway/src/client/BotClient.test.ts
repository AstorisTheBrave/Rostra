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

test("fake-token registry boot loads every module without login or REST writes", async () => {
	const { BotClient } = await import("./BotClient.ts");
	const { loadModules } = await import("./loaders/modules.ts");
	const { registerCommands } = await import("./loaders/commands.ts");
	const { registerEvents } = await import("./loaders/events.ts");
	const { registerInteractions } = await import("./loaders/interactions.ts");
	const { registerJobs } = await import("./loaders/jobs.ts");
	const client = new BotClient();
	let externalAttempts = 0;
	const blocked = async () => {
		externalAttempts++;
		throw new Error("external Discord access is blocked in registry boot tests");
	};
	Object.defineProperty(client, "login", { value: blocked });
	Object.defineProperty(client.rest, "request", { value: blocked });
	try {
		const modules = await loadModules();
		registerCommands(client, modules);
		registerEvents(client, modules);
		registerInteractions(client, modules);
		await registerJobs(modules);
		assert.equal(modules.length, 42);
		assert.equal(client.commands.size, 47);
		assert.equal(externalAttempts, 0);
	} finally {
		client.destroy();
	}
});
