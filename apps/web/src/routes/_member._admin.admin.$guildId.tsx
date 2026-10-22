import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "../screens.tsx";

export const Route = createFileRoute("/_member/_admin/admin/$guildId")({ component: AdminRoute });

function AdminRoute() {
	return <AdminPage guildId={Route.useParams().guildId} />;
}
