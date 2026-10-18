import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_member/_admin")({ component: Outlet });
