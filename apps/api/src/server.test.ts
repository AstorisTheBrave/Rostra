import assert from "node:assert/strict";
import { test } from "node:test";
import type { Principal } from "@rostra/auth";
import type {
	OperationOutboxRepository,
	OperationRecord,
	OperationRepository,
} from "@rostra/operations";
import { IdempotencyConflictError } from "@rostra/operations";
import { createApi } from "./server.ts";

function record(
	status: OperationRecord["status"] = "pending",
	guildId: string | null = null,
	id = "operation-1",
): OperationRecord {
	const now = new Date("2026-10-17T00:00:00.000Z");
	return {
		id,
		guildId,
		kind: "phase00.smoke",
		idempotencyKey: "request-1",
		payload: {},
		status,
		leaseUntil: null,
		claimVersion: 0,
		createdAt: now,
		updatedAt: now,
	};
}

function repository(): OperationRepository & OperationOutboxRepository {
	return {
		async claimOutbox() {
			return { operationId: "operation-1", claimVersion: 1, attempts: 1 };
		},
		async claimDueOutbox() {
			return [];
		},
		async publishOutbox() {
			return true;
		},
		async retryOutbox() {
			return true;
		},
		async create() {
			return { record: record(), created: true };
		},
		async get(id) {
			return id === "operation-1" ? record("completed") : undefined;
		},
		async claim() {
			return { state: "missing" as const };
		},
		async complete() {
			return false;
		},
		async fail() {
			return false;
		},
		async listRecoverable() {
			return [];
		},
		async recordEffect() {
			return true;
		},
	};
}

const guildDirectory = {
	async get(guildId: string) {
		return guildId === "guild-1" ? { id: guildId, configured: true } : undefined;
	},
};

const guildCapabilities = {
	async memberCapabilities(
		subjectId: string,
		guildId: string,
	): Promise<readonly string[] | undefined> {
		return subjectId === "user-1" && guildId === "guild-1" ? ["operations:read"] : undefined;
	},
};

function authenticate(authorization: string | undefined): Principal | undefined {
	if (authorization === "Bearer internal-secret") return { kind: "host", subjectId: "operator" };
	if (authorization === "Bearer guild-1")
		return {
			kind: "guild",
			subjectId: "user-1",
			guildId: "guild-1",
			permissions: ["operations:read", "guilds:read"],
		};
	if (authorization === "Bearer guild-2")
		return {
			kind: "guild",
			subjectId: "user-2",
			guildId: "guild-2",
			permissions: ["operations:read", "guilds:read"],
		};
	if (authorization === "Bearer no-scope")
		return { kind: "guild", subjectId: "user-1", guildId: "guild-1", permissions: [] };
	return undefined;
}

test("public health routes expose only status", async (t) => {
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
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
		authenticate,
		guildDirectory,
		guildCapabilities,
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
	const guildDenied = await app.inject({
		method: "POST",
		url: "/internal/v1/smoke",
		headers: { authorization: "Bearer guild-1", "idempotency-key": "request-1" },
	});
	assert.equal(guildDenied.statusCode, 403);
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

test("operation reads enforce the stored host or guild scope", async (t) => {
	const repo = repository();
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
		ready: async () => true,
		repository: {
			...repo,
			async get(id) {
				if (id === "host-operation") return record("completed", null, id);
				if (id === "guild-operation") return record("completed", "guild-1", id);
				return undefined;
			},
		},
		publisher: { async publish() {} },
		async recordVote() {},
	});
	t.after(() => app.close());
	const request = (id: string, authorization?: string) =>
		app.inject({
			method: "GET",
			url: `/internal/v1/operations/${id}`,
			headers: authorization ? { authorization } : undefined,
		});
	assert.equal((await request("guild-operation")).statusCode, 401);
	assert.equal((await request("guild-operation", "Bearer wrong")).statusCode, 401);
	assert.equal((await request("guild-operation", "Bearer internal-secret")).statusCode, 404);
	assert.equal((await request("guild-operation", "Bearer no-scope")).statusCode, 404);
	assert.equal((await request("guild-operation", "Bearer guild-2")).statusCode, 404);
	assert.equal((await request("guessed-operation", "Bearer guild-2")).statusCode, 404);
	assert.equal((await request("guild-operation", "Bearer guild-1")).statusCode, 200);
	assert.equal((await request("host-operation", "Bearer guild-1")).statusCode, 404);
	assert.equal((await request("host-operation", "Bearer internal-secret")).statusCode, 200);
});

test("delivery failures still accept durable intent for the relay", async (t) => {
	let created = false;
	const repo = repository();
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
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
	assert.equal(response.statusCode, 202);
	assert.equal(response.json().id, "operation-1");
	assert.equal(response.json().status, "pending");
});

test("database creation failure still rejects the request", async (t) => {
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
		ready: async () => true,
		repository: {
			...repository(),
			async create() {
				throw new Error("database unavailable");
			},
		},
		publisher: {
			async publish() {
				throw new Error("must not publish");
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
	assert.equal(response.statusCode, 503);
	assert.deepEqual(response.json(), { error: "storage_unavailable" });
});

test("mismatched idempotency ownership returns a conflict", async (t) => {
	const repo = repository();
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
		ready: async () => true,
		repository: {
			...repo,
			async create() {
				throw new IdempotencyConflictError();
			},
		},
		publisher: { async publish() {} },
		async recordVote() {},
	});
	t.after(() => app.close());
	const response = await app.inject({
		method: "POST",
		url: "/internal/v1/smoke",
		headers: { authorization: "Bearer internal-secret", "idempotency-key": "request-1" },
	});
	assert.equal(response.statusCode, 409);
	assert.deepEqual(response.json(), { error: "idempotency_conflict" });
});

test("vote route preserves external authentication and validation", async (t) => {
	let votes = 0;
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
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

test("guild summaries authorize the exact stored tenant at the data endpoint", async (t) => {
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities,
		ready: async () => true,
		repository: repository(),
		publisher: { async publish() {} },
		async recordVote() {},
	});
	t.after(() => app.close());
	const request = (guildId: string, authorization?: string) =>
		app.inject({
			method: "GET",
			url: `/internal/v1/guilds/${guildId}/summary`,
			headers: authorization ? { authorization } : undefined,
		});
	assert.equal((await request("guild-1")).statusCode, 401);
	assert.equal((await request("guild-1", "Bearer internal-secret")).statusCode, 404);
	assert.equal((await request("guild-1", "Bearer guild-2")).statusCode, 404);
	assert.equal((await request("guild-1", "Bearer no-scope")).statusCode, 404);
	assert.equal((await request("guessed", "Bearer guild-1")).statusCode, 404);
	assert.deepEqual((await request("guild-1", "Bearer guild-1")).json(), {
		id: "guild-1",
		configured: true,
	});
});

test("private guild reads recheck membership and grants after a token is issued", async (t) => {
	let current: readonly string[] | undefined = ["operations:read"];
	const app = await createApi({
		authenticate,
		guildDirectory,
		guildCapabilities: {
			async memberCapabilities(subjectId, guildId) {
				return subjectId === "user-1" && guildId === "guild-1" ? current : undefined;
			},
		},
		ready: async () => true,
		repository: {
			...repository(),
			async get(id) {
				return id === "guild-operation" ? record("completed", "guild-1", id) : undefined;
			},
		},
		publisher: { async publish() {} },
		async recordVote() {},
	});
	t.after(() => app.close());
	const request = (url: string, authorization = "Bearer guild-1") =>
		app.inject({ method: "GET", url, headers: { authorization } });
	const summary = "/internal/v1/guilds/guild-1/summary";
	const operation = "/internal/v1/operations/guild-operation";
	assert.equal((await request(summary)).statusCode, 200);
	assert.equal((await request(operation)).statusCode, 200);
	current = [];
	assert.equal((await request(summary)).statusCode, 200);
	assert.equal((await request(operation)).statusCode, 404);
	current = undefined;
	assert.equal((await request(summary)).statusCode, 200);
	assert.equal((await request(operation)).statusCode, 404);
	assert.equal((await request(summary, "Bearer internal-secret")).statusCode, 404);
	assert.equal((await request("/internal/v1/guilds/guild-2/summary")).statusCode, 404);
});
