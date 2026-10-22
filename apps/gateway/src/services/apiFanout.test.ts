import assert from "node:assert/strict";
import { test } from "node:test";
import { createGatewayApiClient } from "./apiFanout.ts";

test("gateway API fanout forwards the correlated internal request", async () => {
	let observedUrl: URL | undefined;
	let observedInit: RequestInit | undefined;
	const client = createGatewayApiClient({
		baseUrl: "http://api.internal",
		fetch: async (input, init) => {
			observedUrl = new URL(String(input));
			observedInit = init;
			return new Response("{}", { status: 202 });
		},
	});
	const response = await client.forward({
		path: "/internal/v1/smoke",
		method: "POST",
		authorization: "Bearer fake-internal-token",
		idempotencyKey: "smoke-operation",
		correlationId: "smoke-correlation",
		body: { correlationId: "smoke-correlation" },
	});

	assert.equal(response.status, 202);
	assert.equal(observedUrl?.href, "http://api.internal/internal/v1/smoke");
	const headers = new Headers(observedInit?.headers);
	assert.equal(headers.get("authorization"), "Bearer fake-internal-token");
	assert.equal(headers.get("idempotency-key"), "smoke-operation");
	assert.equal(headers.get("x-correlation-id"), "smoke-correlation");
	assert.equal(observedInit?.body, JSON.stringify({ correlationId: "smoke-correlation" }));
});
