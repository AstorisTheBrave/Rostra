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

test("a concurrent lease takeover cannot replace the first claimant's returned fence", async () => {
	const prisma = getPrisma();
	const firstUpdated = signal();
	const releaseFirst = signal();
	const firstRepository = new PrismaOperationRepository(async () => {
		firstUpdated.resolve();
		await releaseFirst.promise;
	});
	const secondRepository = new PrismaOperationRepository();
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

		let secondSettled = false;
		secondClaim = secondRepository.claim(operationId, new Date(2), 1).finally(() => {
			secondSettled = true;
		});
		await delay(100);
		assert.equal(secondSettled, false, "the first claim must retain its row lock through the read");

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
