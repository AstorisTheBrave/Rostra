export function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: { "cache-control": "private, no-store" },
	});
}

export function redirect(location: string, cookies: readonly string[] = []): Response {
	const headers = new Headers({ location, "cache-control": "no-store" });
	for (const cookie of cookies) headers.append("set-cookie", cookie);
	return new Response(null, { status: 302, headers });
}
