import { createFileRoute } from "@tanstack/react-router";
import { ServerDetailPage } from "../screens.tsx";

export const Route = createFileRoute("/_member/servers/$guildId")({ component: ServerDetailRoute });

function ServerDetailRoute() {
	return <ServerDetailPage guildId={Route.useParams().guildId} />;
}
