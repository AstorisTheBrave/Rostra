import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "../screens.tsx";

export const Route = createFileRoute("/_member/profile")({ component: ProfilePage });
