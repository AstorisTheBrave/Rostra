import assert from "node:assert/strict";
import { test } from "node:test";
import type { OperationRecord, OperationRepository } from "@rostra/operations";
import { createApi } from "./server.ts";

function record(status: OperationRecord["status"] = "pending"): OperationRecord {
	const now = new Date("2026-10-17T00:00:00.000Z");
	return {
		id: "operation-1",
		guildId: null,
		kind: "phase00.smoke",
		idempotencyKey: "request-1",
		payload: {},
		status,
		leaseUntil: null,
		createdAt: now,
		updatedAt: now,
	};
}

function repository(): OperationRepository {
	return {
		async create() {
			return { record: record(), created: true };
		},
		async get(id) {
			return id === "operation-1" ? record("completed") : undefined;
		},
		async claim() {
			return undefined;
		},
		async complete() {},
		async fail() {},
		async recordEffect() {
			return true;
		},
	};
}

test("public health routes expose only status", async (t) => {
	const app = await createApi({
		ready: async () => false,
		repository: repository(),
		publisher: { async publish() {} },
		async recordVote() {},
	});
	t.after(() => app.close());
	const live = await app.inject({ method: "GET", url: "/health/live" });
	assert.equal(live.statusCode, 200);
	assert.deepEqual(live.json(), { status: "ok" });
	const ready = await app.inject({ method: "GET", url: "/health/ready" });
	assert.equal(ready.statusCode, 503);
	assert.deepEqual(ready.json(), { status: "not_ready" });
});

test("versioned internal routes require host bearer auth", async (t) => {
	let publishes = 0;
	const app = await createApi({
		internalToken: "internal-secret",
		ready: async () => true,
		repository: repository(),
		publisher: {
			async publish() {
				publishes++;
			},
		},
		async recordVote() {},
	});
	t.after(() => app.close());
	const denied = await app.inject({
		method: "POST",
		url: "/internal/v1/smoke",
		headers: { authorization: "Bearer wrong", "idempotency-key": "request-1" },
	});
	assert.equal(denied.statusCode, 401);
	const accepted = await app.inject({
		method: "POST",
		url: "/internal/v1/smoke",
		headers: { authorization: "Bearer internal-secret", "idempotency-key": "request-1" },
		payload: { message: "smoke" },
	});
	assert.equal(accepted.statusCode, 202);
	assert.equal(accepted.json().id, "operation-1");
	assert.equal(publishes, 1);
});

test("delivery failures return a generic unavailable response after durable creation", async (t) => {
	let created = false;
	const repo = repository();
	const app = await createApi({
		internalToken: "internal-secret",
		ready: async () => false,
		repository: {
			...repo,
			async create(input) {
				created = true;
				return repo.create(input);
			},
		},
		publisher: {
			async publish() {
				throw new Error("private transport detail");
			},
		},
		async recordVote() {},
	});
	t.after(() => app.close());
	const response = await app.inject({
		method: "POST",
		url: "/internal/v1/smoke",
		headers: { authorization: "Bearer internal-secret", "idempotency-key": "request-1" },
	});
	assert.equal(created, true);
	assert.equal(response.statusCode, 503);
	assert.deepEqual(response.json(), { error: "delivery_unavailable" });
});

test("vote route preserves external authentication and validation", async (t) => {
	let votes = 0;
	const app = await createApi({
		voteToken: "vote-secret",
		ready: async () => true,
		repository: repository(),
		publisher: { async publish() {} },
		async recordVote() {
			votes++;
		},
	});
	t.after(() => app.close());
	assert.equal(
		(await app.inject({ method: "POST", url: "/votes/topgg", payload: { user: "1" } })).statusCode,
		401,
	);
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/votes/topgg",
				headers: { authorization: "vote-secret" },
				payload: {},
			})
		).statusCode,
		400,
	);
	assert.equal(
		(
			await app.inject({
				method: "POST",
				url: "/votes/topgg",
				headers: { authorization: "vote-secret" },
				payload: { user: "1" },
			})
		).statusCode,
		200,
	);
	assert.equal(votes, 1);
});
