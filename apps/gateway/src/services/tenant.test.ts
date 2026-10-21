import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuildTenant } from "@rostra/database";
import { isFeatureLive, loadFeatureFlags, registerFeature } from "./featureFlags.ts";
import {
	evictTenantL1,
	getSetting,
	isFeatureBlocked,
	isFeatureEnabled,
	setFeatures,
	tenantFeature,
} from "./tenant.ts";

const tenant = (over: Partial<GuildTenant>): GuildTenant =>
	({
		guildId: "g1",
		locale: "en",
		logChannelId: null,
		modLogChannelId: null,
		welcomeChannelId: null,
		muteRoleId: null,
		features: {},
		settings: {},
		createdAt: new Date(),
		updatedAt: new Date(),
		...over,
	}) as GuildTenant;

test("isFeatureEnabled reads the JSON flag map", () => {
	assert.equal(isFeatureEnabled(tenant({ features: { automod: true } }), "automod"), true);
	assert.equal(isFeatureEnabled(tenant({ features: { automod: false } }), "automod"), false);
	assert.equal(isFeatureEnabled(tenant({ features: {} }), "automod"), false);
	assert.equal(isFeatureEnabled(tenant({ features: null as unknown as object }), "automod"), false);
});

test("tenantFeature returns the three-state flag for the override logic", () => {
	assert.equal(tenantFeature(tenant({ features: { automod: true } }), "automod"), true);
	assert.equal(tenantFeature(tenant({ features: { automod: false } }), "automod"), false);
	assert.equal(tenantFeature(tenant({ features: {} }), "automod"), undefined);
	assert.equal(tenantFeature(tenant({ features: { automod: "yes" } }), "automod"), undefined);
});

test("getSetting reads free-form settings", () => {
	const t = tenant({ settings: { greeting: "hi", count: 3 } });
	assert.equal(getSetting<string>(t, "greeting"), "hi");
	assert.equal(getSetting<number>(t, "count"), 3);
	assert.equal(getSetting(t, "missing"), undefined);
});

test("evictTenantL1 does not throw for unknown guild", () => {
	assert.doesNotThrow(() => evictTenantL1("unknown"));
});

test("guild feature reads fail closed when tenant storage fails", async () => {
	assert.equal(
		await isFeatureBlocked("g1", "automod", async () => tenant({ features: { automod: false } })),
		true,
	);
	assert.equal(
		await isFeatureBlocked("g1", "automod", async () => {
			throw new Error("database unavailable");
		}),
		true,
	);
});

test("global declarations and guild switches remain independent", async () => {
	registerFeature("independent", true);
	await loadFeatureFlags(async () => []);
	assert.equal(isFeatureLive("independent"), true);
	assert.equal(tenantFeature(tenant({ features: { independent: false } }), "independent"), false);
	assert.equal(isFeatureLive("independent"), true);
});

test("feature writes report committed cache fallback and provisioner failures", async () => {
	const result = await setFeatures(
		"g1",
		{ automod: true },
		{
			read: async () => tenant({ features: {} }),
			write: async () => ({
				value: tenant({ features: { automod: true } }),
				coherence: { status: "ttl-fallback", reason: "publish-failed" },
			}),
			provision: async () => {
				throw new Error("private database detail");
			},
		},
	);
	assert.equal(result.coherence.status, "ttl-fallback");
	assert.deepEqual(result.failedProvisioners, ["automod"]);
});

test("feature writes retain a provisioner's publication fallback after tenant publication succeeds", async () => {
	const result = await setFeatures(
		"g1",
		{ automod: true },
		{
			read: async () => tenant({ features: {} }),
			write: async () => ({
				value: tenant({ features: { automod: true } }),
				coherence: { status: "published" },
			}),
			provision: async () => ({ coherence: { status: "ttl-fallback", reason: "publish-failed" } }),
		},
	);
	assert.equal(result.coherence.status, "ttl-fallback");
	assert.equal(
		result.value.features && (result.value.features as Record<string, boolean>).automod,
		true,
	);
	assert.deepEqual(result.failedProvisioners, []);
});
