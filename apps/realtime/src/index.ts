import { verifyPrincipalToken } from "@rostra/auth";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import { createRealtimeApp } from "./server.ts";

const log = getLogger("realtime");

async function main(): Promise<void> {
	if (!config.realtime.enabled) throw new Error("Realtime runtime is disabled");
	if (!config.webApp.sessionSecret) throw new Error("Realtime runtime requires WEB_SESSION_SECRET");
	const tokenSecret = config.webApp.sessionSecret;
	const app = createRealtimeApp({
		authenticate: (authorization) =>
			verifyPrincipalToken(
				authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
				tokenSecret,
			),
	});
	let closing = false;
	const close = async (signal: string) => {
		if (closing) return;
		closing = true;
		log.info({ signal }, "realtime shutdown started");
		await app.close();
		log.info("realtime shutdown complete");
	};
	process.on("SIGINT", () => void close("SIGINT"));
	process.on("SIGTERM", () => void close("SIGTERM"));
	await app.listen({ port: config.realtime.port, host: config.realtime.host });
	log.info({ port: config.realtime.port }, "realtime listening");
}

main().catch((error) => {
	log.error({ err: error }, "realtime boot failed");
	process.exitCode = 1;
});
