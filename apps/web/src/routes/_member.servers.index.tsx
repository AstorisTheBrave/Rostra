import { createFileRoute } from "@tanstack/react-router";
import { ServersPage } from "../screens.tsx";

export const Route = createFileRoute("/_member/servers/")({ component: ServersPage });
