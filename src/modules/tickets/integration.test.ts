import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TicketConfig } from "@prisma/client";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { isFirstResponseBreached } from "./monitor.ts";
import { REOPEN_WINDOW_MS } from "./queue.ts";
import { canDeleteArchivedTicket, isSupport, withTicketLock } from "./service.ts";

test("ticket support-role authorization accepts staff, excludes ordinary members", () => {
	const config = { supportRoleIds: ["support"] } as TicketConfig;
	const member = (roleIds: string[], manageGuild: boolean) =>
		({
			id: "123456789012345678",
			roles: { cache: new Map(roleIds.map((id) => [id, {}])) },
			permissions: {
				has: (permission: bigint) => permission === PermissionFlagsBits.ManageGuild && manageGuild,
			},
		}) as unknown as GuildMember;
	assert.equal(isSupport(member([], false), config), false);
	assert.equal(isSupport(member(["support"], false), config), true);
	assert.equal(isSupport(member([], true), config), true);
});

test("first response SLA respects exact deadline and remains stable after days open", () => {
	const opened = new Date("2026-09-01T00:00:00.000Z");
	const due = opened.getTime() + 60 * 60_000;
	assert.equal(isFirstResponseBreached(opened, null, 60, due), false);
	assert.equal(isFirstResponseBreached(opened, null, 60, due + 1), true);
	assert.equal(isFirstResponseBreached(opened, new Date(due - 1), 60, due + 3 * 86_400_000), false);
	assert.equal(isFirstResponseBreached(opened, new Date(due + 1), 60, due + 1), true);
	assert.equal(isFirstResponseBreached(opened, new Date(due + 59_999), 60, due + 60_000), true);
});

test("archive deletion honors each close generation and the seven-day reopen window", () => {
	const first = Date.parse("2026-09-01T00:00:00Z");
	const second = first + 2 * 86_400_000;
	assert.equal(
		canDeleteArchivedTicket(
			{ open: false, closedAt: new Date(first) },
			first,
			first + REOPEN_WINDOW_MS - 1,
		),
		false,
	);
	assert.equal(
		canDeleteArchivedTicket(
			{ open: false, closedAt: new Date(first) },
			first,
			first + REOPEN_WINDOW_MS,
		),
		true,
	);
	assert.equal(
		canDeleteArchivedTicket(
			{ open: false, closedAt: new Date(second) },
			first,
			first + REOPEN_WINDOW_MS,
		),
		false,
	);
	assert.equal(
		canDeleteArchivedTicket(
			{ open: false, closedAt: new Date(second) },
			undefined,
			first + REOPEN_WINDOW_MS,
		),
		false,
	);
	assert.equal(
		canDeleteArchivedTicket(
			{ open: true, closedAt: new Date(first) },
			first,
			first + REOPEN_WINDOW_MS,
		),
		false,
	);
});

test("concurrent close flows serialize per ticket channel", async () => {
	const calls: string[] = [];
	let finishFirst = () => {};
	let firstStarted = () => {};
	const started = new Promise<void>((resolve) => {
		firstStarted = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		finishFirst = resolve;
	});
	const first = withTicketLock("ticket-concurrency", async () => {
		calls.push("first-start");
		firstStarted();
		await gate;
		calls.push("first-end");
	});
	await started;
	const second = withTicketLock("ticket-concurrency", async () => {
		calls.push("second-start");
	});
	assert.deepEqual(calls, ["first-start"]);
	finishFirst();
	await Promise.all([first, second]);
	assert.deepEqual(calls, ["first-start", "first-end", "second-start"]);
});

test("both ticket close entry points persist user IDs for staffstats", () => {
	const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
	const calls = [
		...source.matchAll(/closeAndArchive\(channel, interaction\.user\.(id|tag)\)/g),
	].map((m) => m[1]);
	assert.deepEqual(calls, ["id"]);
	assert.match(source, /closeAndArchive\(\s*channel,\s*interaction\.user\.id,/);
});
