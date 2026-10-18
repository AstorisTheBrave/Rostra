export type GuildAccess = "administrator" | "manager" | "member";

export interface WebProfile {
	id: string;
	name: string;
}

export interface GuildMembership {
	id: string;
	name: string;
	access: GuildAccess;
}

export interface GuildSummary {
	id: string;
	configured: boolean;
}

export interface GuildClient {
	getGuild(guildId: string, principalToken: string): Promise<GuildSummary | undefined>;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function parseGuildSummary(value: unknown): value is GuildSummary {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === "string" && typeof candidate.configured === "boolean";
}

export function createHttpGuildClient(options: {
	baseUrl: string;
	fetch?: FetchLike;
}): GuildClient {
	const fetcher = options.fetch ?? fetch;
	const base = new URL(options.baseUrl);
	return {
		async getGuild(guildId, principalToken) {
			const path = `internal/v1/guilds/${encodeURIComponent(guildId)}/summary`;
			const response = await fetcher(new URL(path, base), {
				headers: { authorization: `Bearer ${principalToken}` },
			});
			if (response.status === 404) return undefined;
			if (!response.ok) throw new Error("guild_directory_unavailable");
			const body: unknown = await response.json();
			if (!parseGuildSummary(body) || body.id !== guildId)
				throw new Error("invalid_guild_directory_response");
			return body;
		},
	};
}
