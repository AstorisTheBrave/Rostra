import { createFileRoute } from "@tanstack/react-router";
import { OperatorPage } from "../screens.tsx";

export const Route = createFileRoute("/_member/_operator/operator")({ component: OperatorPage });
