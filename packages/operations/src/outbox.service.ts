import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import {
	createAndRelayOperation,
	IdempotencyConflictError,
	PrismaOperationRepository,
} from "./index.ts";

const prisma = getPrisma();
const repository = new PrismaOperationRepository();

test("operation, outbox and domain mutation commit together and rollback together", async () => {
	const key = randomUUID();
	const guildId = `outbox-${key}`;
	let operationId: string | undefined;
	try {
		const created = await repository.create(
			{ kind: "outbox.atomic", idempotencyKey: key, payload: { one: 1 } },
			async (tx) => {
				await tx.guild.create({ data: { id: guildId } });
			},
		);
		operationId = created.record.id;
		assert.equal(await prisma.guild.count({ where: { id: guildId } }), 1);
		assert.equal(await prisma.operationOutbox.count({ where: { operationId } }), 1);
		await assert.rejects(
			repository.create(
				{ kind: "outbox.atomic", idempotencyKey: `${key}-rollback` },
				async (tx) => {
					await tx.guild.create({ data: { id: `${guildId}-rollback` } });
					throw new Error("rollback");
				},
			),
			/rollback/,
		);
		assert.equal(await prisma.guild.count({ where: { id: `${guildId}-rollback` } }), 0);
		assert.equal(
			await prisma.operationRecord.count({ where: { idempotencyKey: `${key}-rollback` } }),
			0,
		);
		assert.equal(
			await prisma.operationOutbox.count({
				where: { operation: { idempotencyKey: `${key}-rollback` } },
			}),
			0,
		);
	} finally {
		if (operationId) await prisma.operationRecord.delete({ where: { id: operationId } });
		await prisma.guild.deleteMany({ where: { id: guildId } });
	}
});

test("concurrent same-key requests commit one matching operation and reject payload reuse", async () => {
	const key = randomUUID();
	const guildId = `outbox-${key}`;
	let operationId: string | undefined;
	try {
		const input = {
			kind: "outbox.concurrent",
			guildId,
			idempotencyKey: key,
			payload: { a: 1, b: 2 },
		};
		const results = await Promise.all([
			repository.create(input),
			repository.create({ ...input, payload: { b: 2, a: 1 } }),
		]);
		operationId = results[0].record.id;
		assert.equal(results[0].record.id, results[1].record.id);
		assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
		assert.equal(await prisma.operationOutbox.count({ where: { operationId } }), 1);
		for (const mismatch of [
			{ ...input, kind: "other" },
			{ ...input, guildId: "other" },
			{ ...input, payload: { a: 9 } },
		])
			await assert.rejects(repository.create(mismatch), IdempotencyConflictError);
		assert.equal(
			(await prisma.operationRecord.findUniqueOrThrow({ where: { id: operationId } })).kind,
			input.kind,
		);
	} finally {
		if (operationId) await prisma.operationRecord.delete({ where: { id: operationId } });
	}
});

test("publication follows commit, failed publish retries, and stale claims cannot settle", async () => {
	const key = randomUUID();
	const guildId = `outbox-${key}`;
	let operationId: string | undefined;
	try {
		const accepted = await createAndRelayOperation(
			repository,
			{
				async publish(payload) {
					assert.equal(await prisma.guild.count({ where: { id: guildId } }), 1);
					assert.equal(
						await prisma.operationOutbox.count({ where: { operationId: payload.operationId } }),
						1,
					);
					throw new Error("private redis detail");
				},
			},
			{ kind: "outbox.publish", idempotencyKey: key },
			async (tx) => {
				await tx.guild.create({ data: { id: guildId } });
			},
		);
		operationId = accepted.record.id;
		assert.equal(accepted.delivery, "degraded");
		const failed = await prisma.operationOutbox.findUniqueOrThrow({ where: { operationId } });
		assert.equal(failed.status, "retryable");
		assert.equal(failed.lastErrorCode, "publish_failed");
		const due = new Date(failed.nextAttemptAt.getTime() + 1);
		const competing = await Promise.all([
			repository.claimOutbox(operationId, due, 1),
			repository.claimOutbox(operationId, due, 1),
		]);
		assert.equal(competing.filter((claim) => claim !== undefined).length, 1);
		const first = competing.find((claim) => claim !== undefined);
		assert.ok(first);
		const second = await repository.claimOutbox(operationId, new Date(due.getTime() + 2), 1);
		assert.ok(second);
		assert.equal(second.claimVersion, first.claimVersion + 1);
		assert.equal(
			await repository.publishOutbox(operationId, first.claimVersion, new Date()),
			false,
		);
		assert.equal(await repository.retryOutbox(operationId, first.claimVersion, new Date()), false);
		assert.equal(
			await repository.publishOutbox(operationId, second.claimVersion, new Date()),
			true,
		);
		assert.equal(
			await repository.claimOutbox(operationId, new Date(Date.now() + 600_000), 1),
			undefined,
		);
	} finally {
		if (operationId) await prisma.operationRecord.delete({ where: { id: operationId } });
		await prisma.guild.deleteMany({ where: { id: guildId } });
	}
});

test("publication waits for the domain transaction to commit", async () => {
	const key = randomUUID();
	const guildId = `outbox-${key}`;
	let mutationStarted = () => {};
	let releaseMutation = () => {};
	const started = new Promise<void>((resolve) => {
		mutationStarted = resolve;
	});
	const release = new Promise<void>((resolve) => {
		releaseMutation = resolve;
	});
	let publications = 0;
	let operationId: string | undefined;
	try {
		const accepted = createAndRelayOperation(
			repository,
			{
				async publish(payload) {
					publications++;
					assert.equal(await prisma.guild.count({ where: { id: guildId } }), 1);
					assert.equal(
						await prisma.operationOutbox.count({ where: { operationId: payload.operationId } }),
						1,
					);
				},
			},
			{ kind: "outbox.commit-order", idempotencyKey: key },
			async (tx) => {
				await tx.guild.create({ data: { id: guildId } });
				mutationStarted();
				await release;
			},
		);
		await started;
		assert.equal(publications, 0);
		assert.equal(await prisma.guild.count({ where: { id: guildId } }), 0);
		releaseMutation();
		const result = await accepted;
		operationId = result.record.id;
		assert.equal(result.delivery, "published");
		assert.equal(publications, 1);
	} finally {
		releaseMutation();
		if (operationId) await prisma.operationRecord.delete({ where: { id: operationId } });
		await prisma.guild.deleteMany({ where: { id: guildId } });
	}
});

test.after(async () => {
	await disconnectPrisma();
});
