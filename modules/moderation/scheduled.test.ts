import assert from "node:assert/strict";
import { test } from "node:test";
import { PermanentScheduledTaskError } from "@rostra/operations";
import type { Client } from "discord.js";
import { liftTempBanTask, removeTempRoleTask } from "./service.ts";

test("temporary moderation handlers reject malformed and cross-guild scheduled payloads", async () => {
	const client = {} as Client;
	await assert.rejects(
		removeTempRoleTask({ guildId: "bad", userId: "456", roleId: "789" }, client, "123"),
		PermanentScheduledTaskError,
	);
	await assert.rejects(
		removeTempRoleTask({ guildId: "123", userId: "456", roleId: "789" }, client, "999"),
		PermanentScheduledTaskError,
	);
	await assert.rejects(
		liftTempBanTask({ guildId: "123", userId: "bad" }, client, "123"),
		PermanentScheduledTaskError,
	);
	await assert.rejects(
		liftTempBanTask({ guildId: "123", userId: "456" }, client, "999"),
		PermanentScheduledTaskError,
	);
});

test("temporary role removal does not trust a stale role cache", async () => {
	let removed = 0;
	const client = {
		guilds: {
			cache: new Map([
				[
					"123",
					{
						members: {
							async fetch() {
								return {
									roles: {
										cache: new Map(),
										async remove() {
											removed++;
										},
									},
								};
							},
						},
					},
				],
			]),
		},
	} as unknown as Client;
	await removeTempRoleTask({ guildId: "123", userId: "456", roleId: "789" }, client, "123");
	assert.equal(removed, 1);
});
