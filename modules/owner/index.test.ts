import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "@rostra/config";
import { registerLocale } from "@rostra/i18n";
import type { ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import { registerFeature } from "@/services/featureFlags.ts";
import owner, { execute } from "./index.ts";

test("owner flag responses distinguish accepted delivery, degradation and failed save", () => {
	assert.match(owner.i18n?.["feature.on"] ?? "", /accepted for delivery/);
	assert.match(owner.i18n?.["feature.off"] ?? "", /accepted for delivery/);
	assert.match(owner.i18n?.["feature.degraded"] ?? "", /delivery to other shards is delayed/);
	assert.match(owner.i18n?.["feature.failed"] ?? "", /couldn't save/);
});

test("owner command reports accepted, degraded and failed writes without raw errors", async () => {
	config.discord.ownerIds.push("test-owner");
	registerFeature("test-owner-flag");
	registerLocale("en", "owner", owner.i18n ?? {});
	const invoke = async (write: typeof import("@/services/featureFlags.ts").setFeatureLive) => {
		let response = "";
		const interaction = {
			user: { id: "test-owner" },
			options: {
				getSubcommand: () => "set",
				getString: () => "test-owner-flag",
				getBoolean: () => true,
			},
			async reply(payload: unknown) {
				response = JSON.stringify(payload);
			},
		} as unknown as ChatInputCommandInteraction;
		await execute({ interaction, client: {} as BotClient }, write);
		return response;
	};
	try {
		assert.match(await invoke(async () => ({ status: "published" })), /accepted for delivery/);
		assert.match(
			await invoke(async () => ({ status: "ttl-fallback", reason: "publish-failed" })),
			/delivery to other shards is delayed/,
		);
		const failed = await invoke(async () => {
			throw new Error("private database detail");
		});
		assert.match(failed, /couldn't save/);
		assert.doesNotMatch(failed, /private database detail/);
	} finally {
		config.discord.ownerIds.splice(config.discord.ownerIds.indexOf("test-owner"), 1);
	}
});
