import { createFileRoute } from "@tanstack/react-router";
import { json } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/api/guilds/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const cookie = request.headers.get("cookie") ?? undefined;
				const runtime = getWebRuntime();
				const result = await runtime.guilds(cookie);
				if (result.status === "unauthorized") return json({ error: "unauthorized" }, 401);
				if (result.status === "degraded") return json({ error: "unavailable" }, 503);
				const session = runtime.session(cookie);
				return session
					? json({ profile: session.profile, guilds: result.guilds })
					: json({ error: "unauthorized" }, 401);
			},
		},
	},
});
