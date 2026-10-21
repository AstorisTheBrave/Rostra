import assert from "node:assert/strict";
import { test } from "node:test";
import { getPrisma, type Prisma } from "@rostra/database";
import { CHANNELS, ROLES } from "./manifest.ts";

test("every cached provisioning wire returns every committed publication outcome", async (ctx) => {
	const db = getPrisma() as unknown as {
		$transaction: (write: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
	};
	const transaction = db.$transaction;
	ctx.after(() => {
		db.$transaction = transaction;
	});
	const owners: string[] = [];
	const upsert = async () => ({ guildId: "g1" });
	db.$transaction = async (write) =>
		write({
			cacheRevision: {
				upsert: async (args: { create: { owner: string } }) => {
					owners.push(args.create.owner);
					return { version: 1n };
				},
			},
			guildTenant: { upsert },
			loggingConfig: { upsert },
			automodConfig: { upsert },
			welcomeConfig: { upsert },
			modmailConfig: { upsert },
			verificationConfig: { upsert },
			starboard: { findFirst: async () => null, create: upsert },
		} as unknown as Prisma.TransactionClient);
	for (const spec of [...CHANNELS, ...ROLES]) {
		if (!spec.wire || spec.key === "feedback") continue;
		owners.length = 0;
		const outcomes = await spec.wire("g1", "resource-1");
		const expected =
			spec.key === "audit-log"
				? ["logging", "tenant"]
				: spec.key === "welcome"
					? ["welcome", "tenant"]
					: spec.key === "mod-logs"
						? ["tenant"]
						: spec.key === "verified"
							? ["verification"]
							: [spec.key === "automod-logs" ? "automod" : spec.key];
		assert.deepEqual(owners, expected, spec.key);
		assert.equal(outcomes.length, expected.length, spec.key);
		assert.ok(
			outcomes.every((outcome) => outcome.status === "ttl-fallback"),
			spec.key,
		);
	}
});
