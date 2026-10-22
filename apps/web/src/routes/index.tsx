import { LoginScreen } from "@rostra/web-ui";
import { createFileRoute } from "@tanstack/react-router";

const errors = new Set(["access_denied", "invalid_state", "invalid_callback", "exchange_failed"]);

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		authError:
			typeof search.authError === "string" && errors.has(search.authError)
				? search.authError
				: undefined,
	}),
	component: LoginRoute,
});

function LoginRoute() {
	const { authError } = Route.useSearch();
	return <LoginScreen error={authError} />;
}
