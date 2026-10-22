import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "../server/http.server.ts";
import { getWebRuntime } from "../server/runtime.server.ts";

export const Route = createFileRoute("/auth/login")({
	server: {
		handlers: {
			GET: async () => {
				const started = getWebRuntime().auth.start();
				return redirect(started.location, started.cookies);
			},
		},
	},
});
