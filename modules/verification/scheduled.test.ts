import assert from "node:assert/strict";
import { test } from "node:test";
import { PermanentScheduledTaskError } from "@rostra/operations";
import type { Client } from "discord.js";
import { verifyKickTask } from "./events.ts";

test("verification kick rejects malformed and cross-guild scheduled payloads", async () => {
	const client = {} as Client;
	await assert.rejects(
		verifyKickTask({ guildId: "bad", userId: "456" }, client, "123"),
		PermanentScheduledTaskError,
	);
	await assert.rejects(
		verifyKickTask({ guildId: "123", userId: "456" }, client, "999"),
		PermanentScheduledTaskError,
	);
});
