import { t } from "@rostra/i18n/browser";
import { PublicInformation } from "@rostra/web-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
	component: () => (
		<PublicInformation
			heading={t("common:web.public.privacyHeading")}
			body={t("common:web.public.privacyBody")}
		/>
	),
});
