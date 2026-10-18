import { t } from "@rostra/i18n/browser";
import {
	type GuildMembership,
	type GuildSummary,
	parseGuildSummary,
	type WebProfile,
} from "@rostra/web-client";
import { AuthenticatedShell, ServerSelector, ServerState } from "@rostra/web-ui";
import { useCallback, useEffect, useState } from "react";

type ResourceFailure = { status: "loading" } | { status: "unauthorized" } | { status: "degraded" };

type SessionResult = ResourceFailure | { status: "ok"; profile: WebProfile };

type GuildsResult =
	| ResourceFailure
	| { status: "ok"; profile: WebProfile; guilds: GuildMembership[] };

type GuildResult =
	| ResourceFailure
	| { status: "not_found"; profile: WebProfile }
	| { status: "ok"; profile: WebProfile; guild: GuildMembership; summary: GuildSummary };

function isProfile(value: unknown): value is WebProfile {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === "string" && typeof candidate.name === "string";
}

function isMembership(value: unknown): value is GuildMembership {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		["administrator", "manager", "member"].includes(String(candidate.access))
	);
}

async function readJson(response: Response): Promise<Record<string, unknown> | undefined> {
	const body: unknown = await response.json().catch(() => undefined);
	return body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
}

async function loadSession(): Promise<SessionResult> {
	try {
		const response = await fetch("/api/session", { headers: { accept: "application/json" } });
		if (response.status === 401) return { status: "unauthorized" };
		const body = await readJson(response);
		return response.ok && isProfile(body?.profile)
			? { status: "ok", profile: body.profile }
			: { status: "degraded" };
	} catch {
		return { status: "degraded" };
	}
}

async function loadGuilds(): Promise<GuildsResult> {
	try {
		const response = await fetch("/api/guilds", { headers: { accept: "application/json" } });
		if (response.status === 401) return { status: "unauthorized" };
		const body = await readJson(response);
		return response.ok &&
			isProfile(body?.profile) &&
			Array.isArray(body.guilds) &&
			body.guilds.every(isMembership)
			? { status: "ok", profile: body.profile, guilds: body.guilds }
			: { status: "degraded" };
	} catch {
		return { status: "degraded" };
	}
}

async function loadGuild(guildId: string): Promise<GuildResult> {
	try {
		const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}`, {
			headers: { accept: "application/json" },
		});
		if (response.status === 401) return { status: "unauthorized" };
		const body = await readJson(response);
		if (response.status === 404 && isProfile(body?.profile))
			return { status: "not_found", profile: body.profile };
		const summary = body?.summary;
		if (!parseGuildSummary(summary)) return { status: "degraded" };
		return response.ok && isProfile(body?.profile) && isMembership(body.guild)
			? { status: "ok", profile: body.profile, guild: body.guild, summary }
			: { status: "degraded" };
	} catch {
		return { status: "degraded" };
	}
}

function UnauthorizedRedirect() {
	useEffect(() => {
		window.location.replace("/");
	}, []);
	return <ServerState state="unauthorized" />;
}

function useResource<T>(load: () => Promise<T>, loading: T) {
	const [result, setResult] = useState(loading);
	const [attempt, setAttempt] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry count deliberately restarts this request.
	useEffect(() => {
		let active = true;
		void load().then((value) => {
			if (active) setResult(value);
		});
		return () => {
			active = false;
		};
	}, [load, attempt]);
	return [result, useCallback(() => setAttempt((value) => value + 1), [])] as const;
}

export function ServersPage() {
	const [result, retry] = useResource(loadGuilds, { status: "loading" } as GuildsResult);
	if (result.status === "unauthorized") return <UnauthorizedRedirect />;
	if (result.status === "loading" || result.status === "degraded")
		return <ServerState state={result.status} onRetry={retry} />;
	return (
		<AuthenticatedShell profile={result.profile} current="servers">
			{result.guilds.length ? (
				<ServerSelector guilds={result.guilds} />
			) : (
				<ServerState state="empty" />
			)}
		</AuthenticatedShell>
	);
}

function SimpleMemberPage({
	current,
	headingKey,
	bodyKey,
}: {
	current: "home" | "profile";
	headingKey: string;
	bodyKey: string;
}) {
	const [result, retry] = useResource(loadSession, { status: "loading" } as SessionResult);
	if (result.status === "unauthorized") return <UnauthorizedRedirect />;
	if (result.status === "loading" || result.status === "degraded")
		return <ServerState state={result.status} onRetry={retry} />;
	return (
		<AuthenticatedShell profile={result.profile} current={current}>
			<section className="status-panel">
				<h1>{t(headingKey)}</h1>
				<p>{t(bodyKey)}</p>
			</section>
		</AuthenticatedShell>
	);
}

export function HomePage() {
	return (
		<SimpleMemberPage
			current="home"
			headingKey="common:web.route.homeHeading"
			bodyKey="common:web.route.homeBody"
		/>
	);
}

export function ProfilePage() {
	return (
		<SimpleMemberPage
			current="profile"
			headingKey="common:web.route.profileHeading"
			bodyKey="common:web.route.profileBody"
		/>
	);
}

export function ServerDetailPage({ guildId }: { guildId: string }) {
	const loader = useCallback(() => loadGuild(guildId), [guildId]);
	const [result, retry] = useResource(loader, { status: "loading" } as GuildResult);
	if (result.status === "unauthorized") return <UnauthorizedRedirect />;
	if (result.status === "loading" || result.status === "degraded")
		return <ServerState state={result.status} onRetry={retry} />;
	if (result.status === "not_found")
		return (
			<AuthenticatedShell profile={result.profile} current="servers">
				<section className="status-panel" role="alert">
					<h1>{t("common:web.route.forbiddenHeading")}</h1>
					<p>{t("common:web.route.forbiddenBody")}</p>
				</section>
			</AuthenticatedShell>
		);
	return (
		<AuthenticatedShell profile={result.profile} current="servers">
			<GuildDetail guild={result.guild} summary={result.summary} />
		</AuthenticatedShell>
	);
}

function GuildDetail({ guild, summary }: { guild: GuildMembership; summary: GuildSummary }) {
	return (
		<section className="status-panel">
			<a href="/servers">{t("common:web.server.back")}</a>
			<h1>{guild.name}</h1>
			<p>
				{summary.configured
					? t("common:web.server.configured")
					: t("common:web.server.notConfigured")}
			</p>
		</section>
	);
}

export function AdminPage({ guildId }: { guildId: string }) {
	const loader = useCallback(() => loadGuild(guildId), [guildId]);
	const [result, retry] = useResource(loader, { status: "loading" } as GuildResult);
	if (result.status === "unauthorized") return <UnauthorizedRedirect />;
	if (result.status === "loading" || result.status === "degraded")
		return <ServerState state={result.status} onRetry={retry} />;
	if (result.status !== "ok" || result.guild.access === "member")
		return (
			<AuthenticatedShell profile={result.profile} current="servers">
				<section className="status-panel" role="alert">
					<h1>{t("common:web.route.forbiddenHeading")}</h1>
					<p>{t("common:web.route.forbiddenBody")}</p>
				</section>
			</AuthenticatedShell>
		);
	return (
		<AuthenticatedShell profile={result.profile} current="servers">
			<GuildDetail guild={result.guild} summary={result.summary} />
		</AuthenticatedShell>
	);
}

export function OperatorPage() {
	const [result, retry] = useResource(loadSession, { status: "loading" } as SessionResult);
	if (result.status === "unauthorized") return <UnauthorizedRedirect />;
	if (result.status === "loading" || result.status === "degraded")
		return <ServerState state={result.status} onRetry={retry} />;
	return (
		<AuthenticatedShell profile={result.profile} current="profile">
			<section className="status-panel" role="alert">
				<h1>{t("common:web.route.forbiddenHeading")}</h1>
				<p>{t("common:web.route.forbiddenBody")}</p>
			</section>
		</AuthenticatedShell>
	);
}
