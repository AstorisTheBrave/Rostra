import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuildTenant } from "@prisma/client";
import { evictTenantL1, getSetting, isFeatureEnabled, tenantFeature } from "./tenant.ts";

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
