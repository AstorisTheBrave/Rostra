import assert from "node:assert/strict";
import { test } from "node:test";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { PrismaScheduledTaskRepository, SCHEDULED_TASK_MAX_ATTEMPTS } from "./scheduler.ts";

test("scheduled claims fence competing workers, cancellation and retained failures", async () => {
	const prisma = getPrisma();
	const repository = new PrismaScheduledTaskRepository();
	const ids: string[] = [];
	const now = new Date();
	try {
		const task = await repository.schedule({ type: "test", runAt: now, guildId: "123" });
		ids.push(task.id);
		const [first, second] = await Promise.all([
			repository.claimDue(now, 1, 1_000),
			repository.claimDue(now, 1, 1_000),
		]);
		assert.equal(first.length + second.length, 1);
		const claim = first[0] ?? second[0];
		assert.ok(claim);
		assert.equal(claim.status, "claimed");
		assert.equal(claim.claimVersion, 1);
		assert.equal(claim.attempts, 0);
		assert.equal(await repository.accept(task.id, 1, now), true);
		assert.equal(
			(await prisma.scheduledTask.findUniqueOrThrow({ where: { id: task.id } })).attempts,
			1,
		);
		assert.equal(await repository.accept(task.id, 1, now), false);
		assert.equal(await repository.cancel(task.id), "processing");
		assert.equal(await repository.complete(task.id, 0), false);
		assert.equal(await repository.fail(task.id, 1, "handler_failed", false, now), true);
		assert.equal(
			(await prisma.scheduledTask.findUniqueOrThrow({ where: { id: task.id } })).status,
			"retryable",
		);
		const retry = (await repository.claimDue(new Date(now.getTime() + 6_000), 1, 1_000))[0];
		assert.ok(retry);
		assert.equal(retry.claimVersion, 2);
		assert.equal(await repository.complete(task.id, 1), false);
		assert.equal(await repository.accept(task.id, 2, new Date(now.getTime() + 6_000)), true);
		assert.equal(await repository.fail(task.id, 2, "invalid_payload", true, now), true);
		const terminal = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: task.id } });
		assert.equal(terminal.status, "failed");
		assert.equal(terminal.lastError, "invalid_payload");
		assert.equal(terminal.runAt.getTime(), now.getTime());

		const cancelled = await repository.schedule({ type: "test", runAt: now });
		ids.push(cancelled.id);
		assert.equal(await repository.cancel(cancelled.id), "cancelled");
		assert.equal(
			(await prisma.scheduledTask.findUniqueOrThrow({ where: { id: cancelled.id } })).status,
			"cancelled",
		);

		const oldImage = await prisma.scheduledTask.create({ data: { type: "test", runAt: now } });
		ids.push(oldImage.id);
		assert.equal(oldImage.nextAttemptAt, null);
		assert.equal((await repository.claimDue(now, 1, 1_000))[0]?.id, oldImage.id);

		const absentGateway = await repository.schedule({ type: "test", runAt: now });
		ids.push(absentGateway.id);
		for (let version = 1; version <= SCHEDULED_TASK_MAX_ATTEMPTS + 2; version++) {
			const dueAt = new Date(now.getTime() + version * 1_000);
			const unaccepted = (await repository.claimDue(dueAt, 20, 100)).find(
				(row) => row.id === absentGateway.id,
			);
			assert.equal(unaccepted?.id, absentGateway.id);
			assert.equal(unaccepted?.claimVersion, version);
			assert.equal(unaccepted?.attempts, 0);
		}
		const noGatewayRow = await prisma.scheduledTask.findUniqueOrThrow({
			where: { id: absentGateway.id },
		});
		assert.equal(noGatewayRow.status, "claimed");
		assert.equal(noGatewayRow.attempts, 0);

		const publishRace = await repository.schedule({ type: "test", runAt: now });
		ids.push(publishRace.id);
		const raceClaim = (await repository.claimDue(now, 20, 1_000)).find(
			(row) => row.id === publishRace.id,
		);
		assert.equal(raceClaim?.id, publishRace.id);
		assert.ok(raceClaim);
		assert.equal(await repository.accept(publishRace.id, raceClaim.claimVersion, now), true);
		assert.equal(
			await repository.deferPublication(publishRace.id, raceClaim.claimVersion, now),
			false,
		);
		assert.equal(
			(await prisma.scheduledTask.findUniqueOrThrow({ where: { id: publishRace.id } })).status,
			"processing",
		);

		const capped = await repository.schedule({ type: "test", runAt: now });
		ids.push(capped.id);
		for (let attempt = 1; attempt <= SCHEDULED_TASK_MAX_ATTEMPTS; attempt++) {
			const dueAt = new Date(now.getTime() + 400_000 * attempt);
			const finalClaim = (await repository.claimDue(dueAt, 20, 1_000)).find(
				(row) => row.id === capped.id,
			);
			assert.ok(finalClaim);
			assert.equal(await repository.accept(capped.id, finalClaim.claimVersion, dueAt), true);
			assert.equal(
				await repository.fail(capped.id, finalClaim.claimVersion, "handler_failed", false, dueAt),
				true,
			);
		}
		assert.equal(
			(await prisma.scheduledTask.findUniqueOrThrow({ where: { id: capped.id } })).status,
			"failed",
		);

		const rollback = await repository.schedule({ type: "test", runAt: now });
		ids.push(rollback.id);
		const rollbackClaim = (await repository.claimDue(now, 1, 1_000))[0];
		assert.ok(rollbackClaim);
		assert.equal(rollbackClaim?.id, rollback.id);
		await prisma.$executeRaw`
			UPDATE "ScheduledTask"
			SET status = 'pending', "leaseUntil" = NULL, "nextAttemptAt" = NULL
			WHERE id = ${rollback.id} AND status IN ('claimed', 'processing', 'retryable')
		`;
		const reset = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: rollback.id } });
		assert.equal(reset.status, "pending");
		assert.equal(reset.runAt.getTime(), now.getTime());
		assert.equal(reset.attempts, rollbackClaim.attempts);
		assert.equal(reset.claimVersion, rollbackClaim.claimVersion);
		assert.equal(reset.leaseUntil, null);
		assert.equal(reset.nextAttemptAt, null);
	} finally {
		await prisma.scheduledTask.deleteMany({ where: { id: { in: ids } } });
		await disconnectPrisma();
	}
});
