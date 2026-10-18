import { defineConfig, devices } from "@playwright/test";

const fixtureEnvironment = {
	DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
	NODE_ENV: "test",
	LOG_LEVEL: "fatal",
	WEB_AUTH_MODE: "fixture",
	WEB_PUBLIC_URL: "http://127.0.0.1:3002",
	WEB_SESSION_SECRET: "fixture-session-secret-at-least-thirty-two-chars",
};

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:3002",
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
	webServer: {
		command: "pnpm dev --host 127.0.0.1",
		cwd: ".",
		env: fixtureEnvironment,
		port: 3002,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
