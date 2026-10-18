import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const result = await getWebRuntime().auth.callback(
					url.searchParams,
					request.headers.get("cookie") ?? undefined,
				);
				return result.ok
					? redirect("/servers", result.cookies)
					: redirect(`/?authError=${result.error}`, result.cookies);
			},
		},
	},
});
