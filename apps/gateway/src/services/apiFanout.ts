export interface GatewayApiRequest {
	path: string;
	method: "GET" | "POST";
	correlationId: string;
	authorization: string;
	idempotencyKey?: string;
	body?: unknown;
}

export interface GatewayApiClientOptions {
	baseUrl: string;
	fetch?: typeof fetch;
}

/** Forwards gateway-owned internal requests to the API without Discord coupling. */
export function createGatewayApiClient({
	baseUrl,
	fetch: fetchImpl = fetch,
}: GatewayApiClientOptions) {
	return {
		forward(request: GatewayApiRequest): Promise<Response> {
			const headers = new Headers({
				authorization: request.authorization,
				"x-correlation-id": request.correlationId,
			});
			if (request.idempotencyKey) headers.set("idempotency-key", request.idempotencyKey);
			if (request.body !== undefined) headers.set("content-type", "application/json");

			return fetchImpl(new URL(request.path, baseUrl), {
				method: request.method,
				headers,
				...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
			});
		},
	};
}
