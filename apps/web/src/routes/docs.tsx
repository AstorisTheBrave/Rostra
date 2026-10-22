import { t } from "@rostra/i18n/browser";
import { PublicInformation } from "@rostra/web-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
	component: () => (
		<PublicInformation
			heading={t("common:web.public.docsHeading")}
			body={t("common:web.public.docsBody")}
		/>
	),
});
