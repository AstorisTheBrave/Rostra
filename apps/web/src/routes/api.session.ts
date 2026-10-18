import { createFileRoute } from "@tanstack/react-router";
import { json } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/api/session")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = getWebRuntime().session(request.headers.get("cookie") ?? undefined);
				return session ? json({ profile: session.profile }) : json({ error: "unauthorized" }, 401);
			},
		},
	},
});
