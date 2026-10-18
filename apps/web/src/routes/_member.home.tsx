import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../screens.tsx";

export const Route = createFileRoute("/_member/home")({ component: HomePage });
