import { defineConfig, devices } from "@playwright/test";

const fixtureEnvironment = {
	DATABASE_URL: "postgresql://rostra:rostra@127.0.0.1:5432/rostra",
	REDIS_URL: "redis://127.0.0.1:6379",
	NODE_ENV: "test",
	LOG_LEVEL: "fatal",
	API_BASE_URL: "http://127.0.0.1:3001",
	API_PORT: "3001",
	INTERNAL_API_TOKEN: "fixture-internal-api-token",
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
	webServer: [
		{
			command: "pnpm start:api",
			cwd: "../..",
			env: fixtureEnvironment,
			url: "http://127.0.0.1:3001/health/ready",
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "pnpm dev --host 127.0.0.1",
			cwd: ".",
			env: fixtureEnvironment,
			port: 3002,
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
