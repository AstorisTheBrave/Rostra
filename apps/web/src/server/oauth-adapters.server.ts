import type { FetchLike, GuildAccess, GuildMembership, WebProfile } from "@rostra/web-client";
import type { OAuthAdapter, OAuthIdentity } from "./auth.server.ts";

const AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const API_URL = "https://discord.com/api/v10";

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function profileFrom(value: unknown): WebProfile {
	const candidate = record(value);
	if (!candidate || typeof candidate.id !== "string" || typeof candidate.username !== "string")
		throw new Error("invalid_oauth_profile");
	const display =
		typeof candidate.global_name === "string" ? candidate.global_name : candidate.username;
	return { id: candidate.id, name: display };
}

function accessFrom(value: string): GuildAccess {
	let permissions: bigint;
	try {
		permissions = BigInt(value);
	} catch {
		throw new Error("invalid_oauth_guild");
	}
	if ((permissions & 8n) === 8n) return "administrator";
	if ((permissions & 32n) === 32n) return "manager";
	return "member";
}

function guildFrom(value: unknown): GuildMembership {
	const candidate = record(value);
	if (
		!candidate ||
		typeof candidate.id !== "string" ||
		typeof candidate.name !== "string" ||
		typeof candidate.permissions !== "string"
	)
		throw new Error("invalid_oauth_guild");
	return { id: candidate.id, name: candidate.name, access: accessFrom(candidate.permissions) };
}

export function createFixtureOAuthAdapter(): OAuthAdapter {
	return {
		authorizationUrl({ state, challenge, redirectUri }) {
			const url = new URL(redirectUri);
			url.searchParams.set("code", "fixture-code");
			url.searchParams.set("state", state);
			url.searchParams.set("code_challenge", challenge);
			return url.toString();
		},
		async exchange(code) {
			if (code !== "fixture-code") throw new Error("invalid_fixture_code");
			return {
				profile: { id: "user-1", name: "Jamie" },
				guilds: [
					{ id: "northstar", name: "Northstar", access: "administrator" },
					{ id: "atlas-studio", name: "Atlas Studio", access: "manager" },
					{ id: "sunday-guild", name: "Sunday Guild", access: "member" },
					{ id: "unconfigured-preview", name: "Unconfigured Preview", access: "member" },
				],
			};
		},
	};
}

export function createDiscordOAuthAdapter(options: {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	fetch?: FetchLike;
}): OAuthAdapter {
	const fetcher = options.fetch ?? fetch;
	return {
		authorizationUrl({ state, challenge }) {
			const url = new URL(AUTHORIZE_URL);
			url.search = new URLSearchParams({
				client_id: options.clientId,
				redirect_uri: options.redirectUri,
				response_type: "code",
				scope: "identify guilds",
				state,
				code_challenge: challenge,
				code_challenge_method: "S256",
			}).toString();
			return url.toString();
		},
		async exchange(code, verifier): Promise<OAuthIdentity> {
			const tokenResponse = await fetcher(TOKEN_URL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: options.clientId,
					client_secret: options.clientSecret,
					grant_type: "authorization_code",
					code,
					redirect_uri: options.redirectUri,
					code_verifier: verifier,
				}),
			});
			const tokenBody: unknown = await tokenResponse.json();
			const token = record(tokenBody)?.access_token;
			if (!tokenResponse.ok || typeof token !== "string") throw new Error("oauth_exchange_failed");
			const headers = { authorization: `Bearer ${token}` };
			const [profileResponse, guildsResponse] = await Promise.all([
				fetcher(`${API_URL}/users/@me`, { headers }),
				fetcher(`${API_URL}/users/@me/guilds`, { headers }),
			]);
			if (!profileResponse.ok || !guildsResponse.ok) throw new Error("oauth_identity_failed");
			const [profileBody, guildsBody]: [unknown, unknown] = await Promise.all([
				profileResponse.json(),
				guildsResponse.json(),
			]);
			if (!Array.isArray(guildsBody)) throw new Error("invalid_oauth_guilds");
			return { profile: profileFrom(profileBody), guilds: guildsBody.map(guildFrom) };
		},
	};
}
