import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { disconnectPrisma, getPrisma } from "@rostra/database";
import { PrismaOperationRepository } from "./index.ts";

function signal() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function waitForSignal(promise: Promise<void>): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => reject(new Error("Timed out waiting for claim update")), 5_000);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

async function waitForBackendLock(backendPid: number, blockingBackendPid: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (true) {
		const [result] = await getPrisma().$queryRaw<[{ waiting: boolean }]>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity AS activity
				JOIN pg_locks AS held_or_waiting ON held_or_waiting.pid = activity.pid
				WHERE activity.pid = ${backendPid}
					AND activity.wait_event_type = 'Lock'
					AND held_or_waiting.granted = false
					AND ${blockingBackendPid} = ANY(pg_blocking_pids(activity.pid))
			) AS "waiting"
		`;
		if (result.waiting) return;
		if (Date.now() >= deadline)
			throw new Error("Timed out waiting for claimant backend to reach the row lock");
		await delay(10);
	}
}

test("a concurrent lease takeover cannot replace the first claimant's returned fence", async () => {
	const prisma = getPrisma();
	const firstUpdated = signal();
	const releaseFirst = signal();
	const secondStarted = signal();
	let firstBackendPid: number | undefined;
	let secondBackendPid: number | undefined;
	const firstRepository = new PrismaOperationRepository({
		beforeUpdate: async (backendPid) => {
			firstBackendPid = backendPid;
		},
		afterUpdate: async () => {
			firstUpdated.resolve();
			await releaseFirst.promise;
		},
	});
	const secondRepository = new PrismaOperationRepository({
		beforeUpdate: async (backendPid) => {
			secondBackendPid = backendPid;
			secondStarted.resolve();
		},
	});
	let operationId: string | undefined;
	let firstClaim: ReturnType<PrismaOperationRepository["claim"]> | undefined;
	let secondClaim: ReturnType<PrismaOperationRepository["claim"]> | undefined;
	try {
		const created = await firstRepository.create({
			kind: "phase00.concurrent-fencing",
			idempotencyKey: `concurrent-fencing-${Date.now()}`,
		});
		operationId = created.record.id;
		firstClaim = firstRepository.claim(operationId, new Date(0), 1);
		await waitForSignal(firstUpdated.promise);

		secondClaim = secondRepository.claim(operationId, new Date(2), 1);
		await waitForSignal(secondStarted.promise);
		if (firstBackendPid === undefined) throw new Error("First claimant backend was not captured");
		if (secondBackendPid === undefined) throw new Error("Second claimant backend was not captured");
		await waitForBackendLock(secondBackendPid, firstBackendPid);

		releaseFirst.resolve();
		const [first, second] = await Promise.all([firstClaim, secondClaim]);
		assert.equal(first.state, "claimed");
		assert.equal(second.state, "claimed");
		if (first.state === "claimed" && second.state === "claimed") {
			assert.equal(first.record.claimVersion, 1);
			assert.equal(second.record.claimVersion, 2);
			assert.notEqual(second.record.claimVersion, first.record.claimVersion);
		}
	} finally {
		releaseFirst.resolve();
		await Promise.allSettled([firstClaim, secondClaim].filter((claim) => claim !== undefined));
		if (operationId) await prisma.operationRecord.deleteMany({ where: { id: operationId } });
		await disconnectPrisma();
	}
});
