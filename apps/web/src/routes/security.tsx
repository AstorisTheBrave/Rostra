import { t } from "@rostra/i18n/browser";
import { PublicInformation } from "@rostra/web-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/security")({
	component: () => (
		<PublicInformation
			heading={t("common:web.public.securityHeading")}
			body={t("common:web.public.securityBody")}
		/>
	),
});
