import assert from "node:assert/strict";
import { test } from "node:test";
import type { Guild } from "discord.js";
import { runProvision } from "./runProvision.ts";

const guild = {
	id: "g1",
	members: { me: { permissions: { has: () => true } } },
	roles: {
		cache: { get: () => undefined, find: () => undefined },
		create: async () => ({ id: "r1" }),
	},
} as unknown as Guild;

test("provisioning reports initial tenant failure without throwing", async () => {
	const result = await runProvision(guild, {
		read: async () => {
			throw new Error("private database detail");
		},
		writeMap: async () => ({ coherence: { status: "published" } }),
		roles: [],
		channels: [],
	});
	assert.equal(result.ok, false);
	assert.equal(result.failure, "tenant-read");
});

test("provisioning reports channel-map persistence failure after creation", async () => {
	const result = await runProvision(guild, {
		read: async () => ({ channelMap: {} }),
		writeMap: async () => {
			throw new Error("private database detail");
		},
		roles: [{ key: "verified", name: "Verified" }],
		channels: [],
	});
	assert.equal(result.ok, false);
	assert.equal(result.failure, "channel-map");
	assert.deepEqual(
		result.items.map((item) => item.status),
		["created"],
	);
	assert.equal(JSON.stringify(result).includes("private database detail"), false);
});

test("provisioning reports committed channel-map delivery fallback", async () => {
	const result = await runProvision(guild, {
		read: async () => ({ channelMap: {} }),
		writeMap: async () => ({ coherence: { status: "ttl-fallback", reason: "publish-failed" } }),
		roles: [{ key: "verified", name: "Verified" }],
		channels: [],
	});
	assert.equal(result.ok, false);
	assert.equal(result.failure, "cache-publication");
});

test("provisioning preserves delayed delivery when the channel-map save also fails", async () => {
	const result = await runProvision(guild, {
		read: async () => ({ channelMap: {} }),
		writeMap: async () => {
			throw new Error("private database detail");
		},
		roles: [
			{
				key: "verified",
				name: "Verified",
				wire: async () => [{ status: "ttl-fallback", reason: "publish-failed" }],
			},
		],
		channels: [],
	});
	assert.equal(result.failure, "channel-map");
	assert.equal(result.deliveryDelayed, true);
});

for (const kind of ["role", "channel"] as const) {
	for (const existed of [false, true]) {
		test(`provisioning preserves ${existed ? "existing" : "created"} ${kind} on wire publication fallback`, async () => {
			const resource = { id: "resource-1", name: "resource", isTextBased: () => true };
			const resources = {
				cache: { get: () => undefined, find: () => (existed ? resource : undefined) },
				create: async () => resource,
			};
			const writes: Record<string, string>[] = [];
			const result = await runProvision(
				{ ...guild, roles: resources, channels: resources } as unknown as Guild,
				{
					read: async () => ({ channelMap: {} }),
					writeMap: async (_guildId, entries) => {
						writes.push(entries);
						return { coherence: { status: "published" } };
					},
					roles:
						kind === "role"
							? [
									{
										key: "resource",
										name: "resource",
										wire: async () => [
											{ status: "ttl-fallback", reason: "publish-failed" },
											{ status: "published" },
										],
									},
								]
							: [],
					channels:
						kind === "channel"
							? [
									{
										key: "resource",
										name: "resource",
										topic: "",
										wire: async () => [
											{ status: "published" },
											{ status: "ttl-fallback", reason: "publish-failed" },
										],
									},
								]
							: [],
				},
			);
			assert.equal(result.ok, false);
			assert.equal(result.failure, "cache-publication");
			assert.equal(result.items[0]?.status, existed ? "existed" : "created");
			assert.equal(result.items[0]?.id, resource.id);
			assert.equal(writes.length, 1);
		});
	}
}
