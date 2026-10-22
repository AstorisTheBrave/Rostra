import assert from "node:assert/strict";
import { test } from "node:test";
import { PermanentScheduledTaskError } from "@rostra/operations";
import type { Client } from "discord.js";
import { archiveDeleteTask } from "./service.ts";

test("ticket archive deletion rejects a malformed channel identifier before database access", async () => {
	await assert.rejects(
		archiveDeleteTask({ channelId: "bad" }, {} as Client, "123"),
		PermanentScheduledTaskError,
	);
});
