import { createFileRoute } from "@tanstack/react-router";
import { json } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/api/guilds/$guildId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const cookie = request.headers.get("cookie") ?? undefined;
				const runtime = getWebRuntime();
				const session = runtime.session(cookie);
				if (!session) return json({ error: "unauthorized" }, 401);
				const result = await runtime.guild(cookie, params.guildId);
				if (result.status === "unauthorized") return json({ error: "unauthorized" }, 401);
				if (result.status === "degraded") return json({ error: "unavailable" }, 503);
				if (result.status === "not_found")
					return json({ error: "not_found", profile: session.profile }, 404);
				return json({
					profile: session.profile,
					guild: result.guild,
					summary: result.summary,
				});
			},
		},
	},
});
