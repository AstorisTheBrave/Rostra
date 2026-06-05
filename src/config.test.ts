import assert from "node:assert/strict";
import { test } from "node:test";

test("loadConfig parses required vars and applies defaults", async () => {
	const { loadConfig } = await import("./config.ts");
	const cfg = loadConfig({
		DISCORD_TOKEN: "t",
		DISCORD_CLIENT_ID: "123",
		DATABASE_URL: "postgresql://localhost/db",
		OWNER_IDS: "1,2,3",
		LAVALINK_NODES: "[]",
	});
	assert.equal(cfg.discord.token, "t");
	assert.deepEqual(cfg.discord.ownerIds, ["1", "2", "3"]);
	assert.equal(cfg.web.port, 3000);
	assert.equal(cfg.sharding.mode, "native");
	assert.equal(cfg.redis.url, undefined);
	assert.deepEqual(cfg.lavalink.nodes, []);
});

test("loadConfig throws aggregated error on missing required vars", async () => {
	const { loadConfig } = await import("./config.ts");
	assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
});

test("loadConfig parses LAVALINK_NODES json array", async () => {
	const { loadConfig } = await import("./config.ts");
	const cfg = loadConfig({
		DISCORD_TOKEN: "t",
		DISCORD_CLIENT_ID: "123",
		DATABASE_URL: "postgresql://localhost/db",
		LAVALINK_NODES: '[{"id":"main","host":"h","port":2333,"password":"p","secure":false}]',
	});
	assert.equal(cfg.lavalink.nodes.length, 1);
	assert.equal(cfg.lavalink.nodes[0]?.host, "h");
});
