import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createCoherentCache, disconnectCache } from "@rostra/cache";
import { closeBus, subscribe } from "@rostra/cache/bus";
import { disconnectPrisma, type GuildTenant, getPrisma } from "@rostra/database";

const CHANNEL = "rostra:cache:v1";

test("independent processes converge; failed and uncommitted writes publish nothing", {
	timeout: 30_000,
}, async () => {
	const guildId = `task4-${randomUUID()}`;
	const tenant = `guild:${guildId}`;
	const cache = createCoherentCache<GuildTenant>("testTenant", "guild");
	assert.equal((await cache.ready).status, "published");
	const racingReader = createCoherentCache<GuildTenant>("testTenant", "guild");
	assert.equal((await racingReader.ready).status, "published");
	let deliveries = 0;
	const observer = subscribe(CHANNEL, (value) => {
		if (typeof value === "object" && value !== null && "tenant" in value && value.tenant === tenant)
			deliveries++;
	});
	await observer.ready;
	await getPrisma().guildTenant.create({ data: { guildId } });
	const child = fork(new URL("./coherent.child.ts", import.meta.url), [guildId], {
		execArgv: ["--import", "tsx"],
		stdio: ["ignore", "inherit", "inherit", "ipc"],
	});
	const next = (type: string): Promise<{ type: string; locale: string }> =>
		new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error(`Child ${type} timed out`)), 5_000);
			const handle = (message: unknown) => {
				if (
					!message ||
					typeof message !== "object" ||
					!("type" in message) ||
					message.type !== type
				)
					return;
				clearTimeout(timeout);
				child.off("message", handle);
				resolve(message as { type: string; locale: string });
			};
			child.on("message", handle);
		});
	let releaseRead: (() => void) | undefined;
	try {
		assert.equal((await next("ready")).locale, "en");
		let readStarted: (() => void) | undefined;
		const readGate = new Promise<void>((resolve) => {
			releaseRead = resolve;
		});
		const started = new Promise<void>((resolve) => {
			readStarted = resolve;
		});
		let loads = 0;
		const racingRead = racingReader.get(guildId, async () => {
			const row = await getPrisma().guildTenant.findUniqueOrThrow({ where: { guildId } });
			if (++loads === 1) {
				readStarted?.();
				await readGate;
			}
			return row;
		});
		await started;
		const readChild = async () => {
			const response = next("read");
			child.send("read");
			return (await response).locale;
		};
		const converge = async (locale: string) => {
			for (let n = 0; n < 100; n++) {
				if ((await readChild()) === locale) return;
				await delay(20);
			}
			assert.fail(`Child did not converge to ${locale}`);
		};
		await cache.write(guildId, (tx) =>
			tx.guildTenant.update({ where: { guildId }, data: { locale: "fr" } }),
		);
		await converge("fr");
		for (let n = 0; n < 100 && deliveries < 1; n++) await delay(20);
		assert.equal(deliveries, 1);
		releaseRead?.();
		assert.equal((await racingRead).locale, "fr");
		assert.equal(loads, 2, "a pre-write PostgreSQL result must not refill local cache");
		await cache.write(guildId, (tx) =>
			tx.guildTenant.update({ where: { guildId }, data: { locale: "de" } }),
		);
		await converge("de");
		const before = deliveries;
		await assert.rejects(
			cache.write(guildId, async (tx) => {
				await tx.guildTenant.update({ where: { guildId }, data: { locale: "es" } });
				throw new Error("rollback");
			}),
		);
		assert.equal(deliveries, before);
		assert.equal(
			(await getPrisma().guildTenant.findUniqueOrThrow({ where: { guildId } })).locale,
			"de",
		);
		let resume: (() => void) | undefined;
		let written: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const inside = new Promise<void>((resolve) => {
			written = resolve;
		});
		const pending = cache.write(guildId, async (tx) => {
			const row = await tx.guildTenant.update({ where: { guildId }, data: { locale: "it" } });
			written?.();
			await gate;
			return row;
		});
		await inside;
		assert.equal(deliveries, before);
		resume?.();
		await pending;
		await converge("it");
		assert.equal(deliveries, before + 1);
	} finally {
		releaseRead?.();
		const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		if (child.exitCode === null) child.send("stop");
		await Promise.race([exited, delay(1_000)]);
		if (child.exitCode === null) child.kill();
		observer.dispose();
		racingReader.dispose();
		cache.dispose();
		closeBus();
		await disconnectCache();
		await getPrisma().cacheRevision.deleteMany({ where: { owner: "testTenant", tenant } });
		await getPrisma().guildTenant.deleteMany({ where: { guildId } });
		await disconnectPrisma();
	}
});
