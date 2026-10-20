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
		assert.equal(modules.length, 42);
		assert.equal(client.commands.size, 47);
		assert.equal(externalAttempts, 0);
	} finally {
		client.destroy();
	}
});

test("failed post-start initialization disposes events and drains modules", async () => {
	const { BotClient } = await import("./BotClient.ts");
	const { moduleRegistry } = await import("@/modules/registry.ts");
	const entry = moduleRegistry.find(({ manifest }) => manifest.id === "ai");
	assert.ok(entry);
	const originalLoad = entry.load;
	const calls: string[] = [];
	entry.load = async () => {
		const imported = await originalLoad();
		return {
			default: {
				...imported.default,
				lifecycle: {
					start: async () => {
						calls.push("start");
					},
					drain: async () => {
						calls.push("drain");
					},
					stop: async () => {
						calls.push("stop");
					},
					dispose: () => {
						calls.push("dispose");
					},
				},
				components: new Proxy([], {
					get(target, key, receiver) {
						if (key === Symbol.iterator)
							return () => {
								throw new Error("late registration failed");
							};
						return Reflect.get(target, key, receiver);
					},
				}),
			},
		};
	};
	const client = new BotClient();
	const listenerCount = client.listenerCount("messageCreate");
	try {
		await assert.rejects(client.init(), /late registration failed/);
		assert.deepEqual(calls, ["start", "drain", "stop", "dispose"]);
		assert.equal(client.listenerCount("messageCreate"), listenerCount);
	} finally {
		entry.load = originalLoad;
		await client.destroy();
	}
});
