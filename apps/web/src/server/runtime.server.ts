import { issuePrincipalToken } from "@rostra/auth";
import { config } from "@rostra/config";
import { getLogger } from "@rostra/logger";
import { createHttpGuildClient, type GuildClient, type GuildMembership } from "@rostra/web-client";
import { createAuthController, MemorySessionStore, type WebSession } from "./auth.server.ts";
import { createDiscordOAuthAdapter, createFixtureOAuthAdapter } from "./oauth-adapters.server.ts";

const log = getLogger("web:runtime");

export function createWebRuntime(options: {
	auth: ReturnType<typeof createAuthController>;
	guildClient: GuildClient;
	tokenSecret: string;
}) {
	function scopedToken(session: WebSession, guild: GuildMembership, now: number): string {
		const permissions = ["guilds:read"];
		if (guild.access !== "member") permissions.push("guilds:admin");
		return issuePrincipalToken(
			{
				kind: "guild",
				subjectId: session.profile.id,
				guildId: guild.id,
				permissions,
			},
			"api",
			options.tokenSecret,
			now + 60_000,
		);
	}

	return {
		auth: options.auth,
		session(cookie: string | undefined, now = Date.now()) {
			return options.auth.session(cookie, now);
		},
		async guilds(cookie: string | undefined, now = Date.now()) {
			const session = options.auth.session(cookie, now);
			if (!session) return { status: "unauthorized" as const };
			try {
				const resolved = await Promise.all(
					session.guilds.map(async (guild) => {
						const summary = await options.guildClient.getGuild(
							guild.id,
							scopedToken(session, guild, now),
						);
						return summary ? guild : undefined;
					}),
				);
				return { status: "ok" as const, guilds: resolved.filter((guild) => guild !== undefined) };
			} catch (error) {
				log.error({ err: error }, "guild directory request failed");
				return { status: "degraded" as const };
			}
		},
		async guild(cookie: string | undefined, guildId: string, now = Date.now()) {
			const session = options.auth.session(cookie, now);
			if (!session) return { status: "unauthorized" as const };
			const membership = session.guilds.find((guild) => guild.id === guildId);
			if (!membership) return { status: "not_found" as const };
			try {
				const summary = await options.guildClient.getGuild(
					guildId,
					scopedToken(session, membership, now),
				);
				return summary
					? { status: "ok" as const, guild: membership, summary }
					: { status: "not_found" as const };
			} catch (error) {
				log.error({ err: error }, "guild detail request failed");
				return { status: "degraded" as const };
			}
		},
	};
}

let runtime: ReturnType<typeof createWebRuntime> | undefined;

export function getWebRuntime(): ReturnType<typeof createWebRuntime> {
	if (runtime) return runtime;
	const secret = config.webApp.sessionSecret;
	if (!secret) throw new Error("Web runtime requires WEB_SESSION_SECRET");
	const callbackUrl = new URL("/auth/callback", config.webApp.publicUrl).toString();
	if (config.webApp.authMode === "fixture" && config.env === "production")
		throw new Error("Fixture web authentication is disabled in production");
	const adapter =
		config.webApp.authMode === "fixture"
			? createFixtureOAuthAdapter()
			: createDiscordOAuthAdapter({
					clientId: config.discord.clientId ?? "",
					clientSecret: config.discord.clientSecret ?? "",
					redirectUri: callbackUrl,
				});
	if (
		config.webApp.authMode === "discord" &&
		(!config.discord.clientId || !config.discord.clientSecret)
	)
		throw new Error("Web OAuth requires DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET");
	runtime = createWebRuntime({
		auth: createAuthController({
			adapter,
			redirectUri: callbackUrl,
			secret,
			store: new MemorySessionStore(),
			secure: new URL(config.webApp.publicUrl).protocol === "https:",
		}),
		guildClient: createHttpGuildClient({ baseUrl: config.api.baseUrl }),
		tokenSecret: secret,
	});
	return runtime;
}
