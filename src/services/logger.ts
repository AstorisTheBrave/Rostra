import { type Logger, pino } from "pino";
import { config } from "@/config.ts";

const redactPaths = [
	"token",
	"*.token",
	"password",
	"*.password",
	"auth",
	"*.auth",
	"DISCORD_TOKEN",
];

const root: Logger =
	config.env === "production"
		? pino({ level: config.logLevel, redact: redactPaths })
		: pino({
				level: config.logLevel,
				redact: redactPaths,
				transport: {
					target: "pino-pretty",
					options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
				},
			});

const children = new Map<string, Logger>();

/** Scoped child logger (cached per scope). Never log provider names. */
export function getLogger(scope: string): Logger {
	let child = children.get(scope);
	if (!child) {
		child = root.child({ scope });
		children.set(scope, child);
	}
	return child;
}

export { root as logger };
