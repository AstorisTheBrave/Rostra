import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/auth/logout")({
	server: {
		handlers: {
			POST: async ({ request }) =>
				redirect("/", getWebRuntime().auth.logout(request.headers.get("cookie") ?? undefined)),
		},
	},
});
