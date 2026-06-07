import { z } from "zod";

const csv = (v: string | undefined): string[] =>
	v
		? v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];

const lavalinkNode = z.object({
	id: z.string(),
	host: z.string(),
	port: z.number().int(),
	password: z.string(),
	secure: z.boolean().default(false),
});

type LavalinkNode = z.infer<typeof lavalinkNode>;

const schema = z.object({
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CLIENT_ID: z.string().min(1),
	OWNER_IDS: z.string().optional(),
	DEV_GUILD_ID: z.string().optional(),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
	DATABASE_URL: z.string().min(1),
	REDIS_URL: z.string().optional(),
	PORT: z.coerce.number().int().default(3000),
	HOST: z.string().default("0.0.0.0"),
	// Named TOTAL_SHARDS (not SHARD_COUNT) to avoid colliding with discord.js's reserved
	// SHARD_COUNT env var that the ShardingManager sets on spawned shard processes.
	TOTAL_SHARDS: z.coerce.number().int().positive().optional(),
	SHARDING_MODE: z.enum(["native", "hybrid"]).default("native"),
	AI_API_KEY: z.string().optional(),
	AI_BASE_URL: z.string().optional(),
	AI_MODEL: z.string().optional(),
	LAVALINK_NODES: z.string().default("[]"),
	LAVALINK_RECONNECT_TRIES: z.coerce.number().int().default(5),
	LAVALINK_RESUME: z.coerce.boolean().default(true),
	LAVALINK_REST_TIMEOUT: z.coerce.number().int().default(10000),
	TOPGG_TOKEN: z.string().optional(),
	TOPGG_WEBHOOK_AUTH: z.string().optional(),
	TOPGG_BOT_ID: z.string().optional(),
	TWITCH_CLIENT_ID: z.string().optional(),
	TWITCH_CLIENT_SECRET: z.string().optional(),
});

export type Config = {
	env: "development" | "production" | "test";
	discord: { token: string; clientId: string; ownerIds: string[]; devGuildId?: string };
	logLevel: string;
	database: { url: string };
	redis: { url?: string };
	web: { port: number; host: string };
	sharding: { count?: number; mode: "native" | "hybrid" };
	ai: { apiKey?: string; baseUrl?: string; model?: string };
	lavalink: {
		nodes: LavalinkNode[];
		reconnectTries: number;
		resume: boolean;
		restTimeout: number;
	};
	topgg: { token?: string; webhookAuth?: string; botId?: string };
	twitch: { clientId?: string; clientSecret?: string };
};

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
	// Treat empty strings (common from .env files) as absent so defaults/optionals apply.
	const cleaned: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(source)) cleaned[k] = v === "" ? undefined : v;
	const parsed = schema.safeParse(cleaned);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		throw new Error(`Invalid environment configuration: ${issues}`);
	}
	const e = parsed.data;
	const nodes = z.array(lavalinkNode).parse(JSON.parse(e.LAVALINK_NODES));
	return Object.freeze({
		env: e.NODE_ENV,
		discord: {
			token: e.DISCORD_TOKEN,
			clientId: e.DISCORD_CLIENT_ID,
			ownerIds: csv(e.OWNER_IDS),
			devGuildId: e.DEV_GUILD_ID,
		},
		logLevel: e.LOG_LEVEL,
		database: { url: e.DATABASE_URL },
		redis: { url: e.REDIS_URL },
		web: { port: e.PORT, host: e.HOST },
		sharding: { count: e.TOTAL_SHARDS, mode: e.SHARDING_MODE },
		ai: { apiKey: e.AI_API_KEY, baseUrl: e.AI_BASE_URL, model: e.AI_MODEL },
		lavalink: {
			nodes,
			reconnectTries: e.LAVALINK_RECONNECT_TRIES,
			resume: e.LAVALINK_RESUME,
			restTimeout: e.LAVALINK_REST_TIMEOUT,
		},
		topgg: { token: e.TOPGG_TOKEN, webhookAuth: e.TOPGG_WEBHOOK_AUTH, botId: e.TOPGG_BOT_ID },
		twitch: { clientId: e.TWITCH_CLIENT_ID, clientSecret: e.TWITCH_CLIENT_SECRET },
	});
}

/** Cached, validated, frozen config (computed once at import). The ONLY place env is read. */
export const config: Config = loadConfig();
