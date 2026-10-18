import { verifyPrincipalToken } from "@rostra/auth";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import { createActivityApp } from "./server.ts";

const log = getLogger("activity");

async function main(): Promise<void> {
	if (!config.activity.enabled) throw new Error("Activity runtime is disabled");
	if (!config.webApp.sessionSecret) throw new Error("Activity runtime requires WEB_SESSION_SECRET");
	const tokenSecret = config.webApp.sessionSecret;
	const app = createActivityApp({
		authenticate: (authorization) =>
			verifyPrincipalToken(
				authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
				tokenSecret,
				"activity",
			),
	});
	let closing = false;
	const close = async (signal: string) => {
		if (closing) return;
		closing = true;
		log.info({ signal }, "activity shutdown started");
		await app.close();
		log.info("activity shutdown complete");
	};
	process.on("SIGINT", () => void close("SIGINT"));
	process.on("SIGTERM", () => void close("SIGTERM"));
	await app.listen({ port: config.activity.port, host: config.activity.host });
	log.info({ port: config.activity.port }, "activity listening");
}

main().catch((error) => {
	log.error({ err: error }, "activity boot failed");
	process.exitCode = 1;
});
