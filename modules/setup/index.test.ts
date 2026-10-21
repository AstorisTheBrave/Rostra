import assert from "node:assert/strict";
import { test } from "node:test";
import { getPrisma, type Prisma } from "@rostra/database";
import { registerLocale } from "@rostra/i18n";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import type { BotClient } from "@/client/BotClient.ts";
import setup, { featureWarning, provisionWarnings } from "./index.ts";

test("setup module exposes /setup and a setup component", () => {
	assert.equal(setup.name, "setup");
	assert.equal(setup.commands?.[0]?.data.name, "setup");
	assert.equal(setup.components?.[0]?.prefix, "setup");
});

test("setup warns for both failed provisioning and delayed fleet delivery", () => {
	registerLocale("en", "setup", setup.i18n ?? {});
	const warning = featureWarning({
		value: {} as never,
		coherence: { status: "ttl-fallback", reason: "publish-failed" },
		failedProvisioners: ["automod"],
	});
	assert.match(warning ?? "", /feature setup failed/);
	assert.match(warning ?? "", /delivery to other shards is delayed/);
});

test("setup renders both channel-map failure and delayed-delivery warnings", () => {
	registerLocale("en", "setup", setup.i18n ?? {});
	const warnings = provisionWarnings({ failure: "channel-map", deliveryDelayed: true });
	assert.equal(warnings.length, 2);
	assert.match(warnings[0] ?? "", /channel and role list could not be saved/);
	assert.match(warnings[1] ?? "", /Committed setup changes/);
	assert.match(warnings[1] ?? "", /delivery to other shards is delayed/);
});

test("setup i18n covers the panel strings", () => {
	for (const key of ["title", "intro", "applyBaseline", "createLog", "logSet", "logNone"]) {
		assert.ok(setup.i18n?.[key], `missing i18n key ${key}`);
	}
});

for (const action of ["language", "logchannel"]) {
	test(`setup ${action} warns after a committed write with delivery fallback`, async (ctx) => {
		registerLocale("en", "setup", setup.i18n ?? {});
		const db = getPrisma() as unknown as {
			$transaction: (write: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
		};
		const transaction = db.$transaction;
		ctx.after(() => {
			db.$transaction = transaction;
		});
		db.$transaction = async (write) =>
			write({
				cacheRevision: { upsert: async () => ({ version: 1n }) },
				guildTenant: {
					upsert: async () => ({ guildId: "g1", locale: "fr", logChannelId: "c1", features: {} }),
				},
			} as unknown as Prisma.TransactionClient);
		let response: unknown;
		const interaction = {
			guildId: "g1",
			memberPermissions: { has: () => true },
			options: { getSubcommand: () => action, getString: () => "fr" },
			isButton: () => true,
			reply: async (payload: unknown) => {
				response = payload;
			},
			update: async (payload: unknown) => {
				response = payload;
			},
		};
		const client = {
			guilds: { cache: { get: () => ({ channels: { create: async () => ({ id: "c1" }) } }) } },
		} as unknown as BotClient;
		if (action === "language")
			await setup.commands?.[0]?.execute({
				interaction: interaction as unknown as ChatInputCommandInteraction,
				client,
			});
		else
			await setup.components?.[0]?.execute(
				interaction as unknown as MessageComponentInteraction,
				[action],
				client,
			);
		const rendered = JSON.stringify(response);
		assert.match(rendered, /delivery to other shards is delayed/);
		assert.doesNotMatch(rendered, /Bot messages here now use it/);
	});
}
