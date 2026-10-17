import assert from "node:assert/strict";
import { test } from "node:test";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import { hashCommands } from "./commandSync.ts";

const cmd = (name: string, description: string): RESTPostAPIApplicationCommandsJSONBody =>
	({ name, description, type: 1 }) as RESTPostAPIApplicationCommandsJSONBody;

test("hashCommands is deterministic", () => {
	const body = [cmd("ping", "a"), cmd("help", "b")];
	assert.equal(hashCommands(body), hashCommands(body));
});

test("hashCommands ignores load order (sorts by name)", () => {
	const a = [cmd("ping", "a"), cmd("help", "b")];
	const b = [cmd("help", "b"), cmd("ping", "a")];
	assert.equal(hashCommands(a), hashCommands(b));
});

test("hashCommands changes when a definition changes", () => {
	const before = [cmd("ping", "Check latency")];
	const after = [cmd("ping", "Check the bot latency")];
	assert.notEqual(hashCommands(before), hashCommands(after));
});
