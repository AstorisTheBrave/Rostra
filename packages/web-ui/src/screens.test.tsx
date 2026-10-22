import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AuthenticatedShell,
	CallbackFailure,
	LoginScreen,
	ServerSelector,
	ServerState,
} from "./screens.tsx";

const profile = { id: "user-1", name: "Jamie" };
const guilds = [
	{ id: "northstar", name: "Northstar", access: "administrator" as const },
	{ id: "atlas", name: "Atlas Studio", access: "manager" as const },
	{ id: "sunday", name: "Sunday Guild", access: "member" as const },
];

test("login preserves the accepted copy and semantic landmarks", () => {
	const html = renderToStaticMarkup(<LoginScreen />);
	assert.match(html, /<header/);
	assert.match(html, /<main id="main-content"/);
	assert.match(html, /<footer/);
	assert.match(html, /Your server, one place/);
	assert.match(html, /Continue with Discord/);
	assert.match(html, /href="\/auth\/login"/);
});

test("selector uses a list, exact visible data and working links", () => {
	const html = renderToStaticMarkup(
		<AuthenticatedShell profile={profile} current="servers">
			<ServerSelector guilds={guilds} />
		</AuthenticatedShell>,
	);
	assert.match(html, /<nav/);
	assert.match(html, /aria-current="page"/);
	assert.match(html, /<ul class="server-list"/);
	assert.equal((html.match(/<li/g) ?? []).length, 3);
	assert.match(html, /Northstar/);
	assert.match(html, /Administrator/);
	assert.match(html, /href="\/servers\/northstar"/);
	assert.match(html, /3 servers available/);
});

test("asynchronous states expose polite status or assertive alerts", () => {
	assert.match(renderToStaticMarkup(<ServerState state="loading" />), /role="status"/);
	assert.match(
		renderToStaticMarkup(<ServerState state="degraded" onRetry={() => undefined} />),
		/role="alert"/,
	);
	assert.match(renderToStaticMarkup(<CallbackFailure error="invalid_state" />), /role="alert"/);
});
