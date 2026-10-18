import { t } from "@rostra/i18n/browser";
import type { GuildMembership, WebProfile } from "@rostra/web-client";
import type { ReactNode } from "react";

function Brand() {
	return (
		<a className="brand" href="/">
			{t("common:web.brand")}
		</a>
	);
}

function Icon({ name }: { name: "home" | "servers" | "profile" | "logout" | "discord" }) {
	const paths = {
		home: <path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z" />,
		servers: (
			<>
				<rect x="3" y="4" width="18" height="6" rx="2" />
				<rect x="3" y="14" width="18" height="6" rx="2" />
				<path d="M7 7h.01M7 17h.01" />
			</>
		),
		profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
		logout: <path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9" />,
		discord: (
			<path d="M7.5 7.5c3-1.6 6-1.6 9 0 1.6 2.4 2.2 4.8 2 7.2-1.8 1.5-3.5 2.2-5.2 2.5l-.7-1.1c.8-.2 1.5-.5 2.2-.9-2 .9-4.5.9-6.6 0 .7.4 1.4.7 2.2.9l-.7 1.1c-1.7-.3-3.4-1-5.2-2.5-.2-2.4.4-4.8 2-7.2ZM9 13.5c.8 0 1.4-.7 1.4-1.5S9.8 10.5 9 10.5s-1.4.7-1.4 1.5S8.2 13.5 9 13.5Zm6 0c.8 0 1.4-.7 1.4-1.5s-.6-1.5-1.4-1.5-1.4.7-1.4 1.5.6 1.5 1.4 1.5Z" />
		),
	};
	return (
		<svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			{paths[name]}
		</svg>
	);
}

function Chevron() {
	return (
		<svg className="chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
			<path d="m5 3 5 5-5 5" />
		</svg>
	);
}

export function LoginScreen({ error }: { error?: string }) {
	return (
		<div className="login-page">
			<a className="skip-link" href="#main-content">
				{t("common:web.skip")}
			</a>
			<header className="login-header">
				<Brand />
				<a href="/docs">{t("common:web.footer.documentation")}</a>
			</header>
			<main id="main-content" className="login-main" tabIndex={-1}>
				{error ? <CallbackFailure error={error} /> : null}
				<div className="login-flow" aria-hidden="true">
					<span className="flow-node flow-node-one">
						<Icon name="profile" />
					</span>
					<span className="flow-node flow-node-two">
						<svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
							<path d="m9 12 2 2 4-4" />
						</svg>
					</span>
					<span className="flow-node flow-node-three">
						<svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
							<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
							<path d="m19 13 2 1-2 4-2-1a8 8 0 0 1-2 1l-.3 2h-5L9 18a8 8 0 0 1-2-1l-2 1-2-4 2-1a8 8 0 0 1 0-2l-2-1 2-4 2 1a8 8 0 0 1 2-1l.3-2h5L15 6a8 8 0 0 1 2 1l2-1 2 4-2 1a8 8 0 0 1 0 2Z" />
						</svg>
					</span>
					<span className="flow-line" />
				</div>
				<section className="login-panel" aria-labelledby="login-heading">
					<h1 id="login-heading">{t("common:web.login.heading")}</h1>
					<p>{t("common:web.login.body")}</p>
					<a className="primary-action" href="/auth/login">
						<Icon name="discord" />
						{t("common:web.login.continue")}
					</a>
				</section>
				<div className="login-output" aria-hidden="true">
					<span />
					<span />
					<span />
				</div>
			</main>
			<footer className="login-footer">
				<a href="/docs">{t("common:web.footer.documentation")}</a>
				<a href="/privacy">{t("common:web.footer.privacy")}</a>
				<a href="/security">{t("common:web.footer.security")}</a>
			</footer>
		</div>
	);
}

export function PublicInformation({ heading, body }: { heading: string; body: string }) {
	return (
		<div className="login-page public-page">
			<a className="skip-link" href="#main-content">
				{t("common:web.skip")}
			</a>
			<header className="login-header">
				<Brand />
			</header>
			<main id="main-content" className="login-main" tabIndex={-1}>
				<section className="login-panel" aria-labelledby="public-heading">
					<h1 id="public-heading">{heading}</h1>
					<p>{body}</p>
					<a className="secondary-action" href="/">
						{t("common:web.public.return")}
					</a>
				</section>
			</main>
			<footer className="login-footer">
				<a href="/docs">{t("common:web.footer.documentation")}</a>
				<a href="/privacy">{t("common:web.footer.privacy")}</a>
				<a href="/security">{t("common:web.footer.security")}</a>
			</footer>
		</div>
	);
}

export function CallbackFailure({ error }: { error: string }) {
	const key = {
		access_denied: "common:web.callback.accessDenied",
		invalid_state: "common:web.callback.invalidState",
		exchange_failed: "common:web.callback.exchangeFailed",
		invalid_callback: "common:web.callback.invalidCallback",
	}[error];
	return (
		<div className="callback-alert" role="alert" aria-live="assertive">
			<strong>{t("common:web.callback.heading")}</strong>
			<span>{t(key ?? "common:web.callback.exchangeFailed")}</span>
			<a href="/">{t("common:web.callback.dismiss")}</a>
		</div>
	);
}

function Navigation({ current }: { current: "home" | "servers" | "profile" }) {
	const items = [
		{ id: "home" as const, href: "/home", label: t("common:web.nav.home") },
		{ id: "servers" as const, href: "/servers", label: t("common:web.nav.servers") },
		{ id: "profile" as const, href: "/profile", label: t("common:web.nav.profile") },
	];
	return (
		<nav className="app-nav" aria-label={t("common:web.nav.main")}>
			{items.map((item) => (
				<a key={item.id} href={item.href} aria-current={current === item.id ? "page" : undefined}>
					<Icon name={item.id} />
					<span>{item.label}</span>
				</a>
			))}
		</nav>
	);
}

function SignOut({ className }: { className: string }) {
	return (
		<form className={className} action="/auth/logout" method="post">
			<button type="submit">
				<Icon name="logout" />
				{t("common:web.account.signOut")}
			</button>
		</form>
	);
}

function Account({ profile }: { profile: WebProfile }) {
	return (
		<details className="account-menu">
			<summary>
				<span className="avatar" aria-hidden="true">
					{profile.name.slice(0, 1).toUpperCase()}
				</span>
				<span>{profile.name}</span>
				<span className="account-caret" aria-hidden="true" />
			</summary>
			<SignOut className="account-signout" />
		</details>
	);
}

export function AuthenticatedShell({
	profile,
	current,
	children,
}: {
	profile: WebProfile;
	current: "home" | "servers" | "profile";
	children: ReactNode;
}) {
	return (
		<div className="app-shell">
			<a className="skip-link" href="#main-content">
				{t("common:web.skip")}
			</a>
			<aside className="desktop-rail">
				<Brand />
				<Navigation current={current} />
				<SignOut className="desktop-signout" />
			</aside>
			<header className="mobile-header">
				<Brand />
				<Account profile={profile} />
			</header>
			<div className="desktop-account">
				<Account profile={profile} />
			</div>
			<main id="main-content" className="app-main" tabIndex={-1}>
				{children}
			</main>
			<div className="mobile-nav">
				<Navigation current={current} />
			</div>
		</div>
	);
}

function roleLabel(access: GuildMembership["access"]): string {
	return t(`common:web.servers.role.${access}`);
}

export function ServerSelector({ guilds }: { guilds: readonly GuildMembership[] }) {
	return (
		<section className="selector" aria-labelledby="servers-heading">
			<h1 id="servers-heading">{t("common:web.servers.heading")}</h1>
			<p className="lede">{t("common:web.servers.body")}</p>
			<h2>{t("common:web.servers.list")}</h2>
			<ul className="server-list">
				{guilds.map((guild, index) => {
					const action = guild.access === "member" ? "view" : "open";
					return (
						<li key={guild.id}>
							<span className={`server-avatar server-avatar-${(index % 3) + 1}`}>
								{guild.name.slice(0, 1).toUpperCase()}
							</span>
							<span className="server-copy">
								<strong>{guild.name}</strong>
								<span>{roleLabel(guild.access)}</span>
							</span>
							<a className={`server-action server-action-${action}`} href={`/servers/${guild.id}`}>
								{t(`common:web.servers.${action}`)}
								<Chevron />
							</a>
						</li>
					);
				})}
			</ul>
			<p className="server-count" aria-live="polite">
				{t("common:web.servers.count", { count: guilds.length })}
			</p>
		</section>
	);
}

export function ServerState({
	state,
	onRetry,
}: {
	state: "loading" | "empty" | "degraded" | "unauthorized";
	onRetry?: () => void;
}) {
	if (state === "loading")
		return (
			<div className="loading-state" role="status" aria-live="polite">
				<span>{t("common:web.servers.loading")}</span>
				<span className="skeleton" />
				<span className="skeleton" />
				<span className="skeleton" />
			</div>
		);
	const prefix = state === "unauthorized" ? "unauthorized" : `servers.${state}`;
	return (
		<section
			className="status-panel"
			role={state === "degraded" ? "alert" : "status"}
			aria-live={state === "degraded" ? "assertive" : "polite"}
		>
			<h1>{t(`common:web.${prefix}.heading`)}</h1>
			<p>{t(`common:web.${prefix}.body`)}</p>
			{state === "degraded" && onRetry ? (
				<button type="button" onClick={onRetry}>
					{t("common:web.servers.retry")}
				</button>
			) : null}
		</section>
	);
}
