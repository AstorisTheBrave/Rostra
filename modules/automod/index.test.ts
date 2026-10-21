import assert from "node:assert/strict";
import { test } from "node:test";
import { type GuildTenant, getPrisma, type Prisma } from "@rostra/database";
import { setFeatures } from "@/services/tenant.ts";
import { provisionAutomod } from "./index.ts";

test("registered automod provisioner exposes its committed cache fallback", async (ctx) => {
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
			guildTenant: { upsert: async () => ({ guildId: "g1", features: { automod: true } }) },
			automodConfig: { upsert: async () => ({ guildId: "g1", enabled: true }) },
		} as unknown as Prisma.TransactionClient);
	const model = getPrisma().guildTenant as unknown as { upsert: () => Promise<GuildTenant> };
	const upsert = model.upsert;
	ctx.after(() => {
		model.upsert = upsert;
	});
	model.upsert = async () => ({ guildId: "g1", features: {} }) as GuildTenant;
	const result = await setFeatures("g1", { automod: true });
	assert.equal(result.coherence.status, "ttl-fallback");
	const provisioned = await provisionAutomod("g1", true);
	assert.equal(provisioned.coherence.status, "ttl-fallback");
	assert.equal(provisioned.value.enabled, true);
});
