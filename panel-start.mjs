// Launcher for game-panel hosts (Pterodactyl, Ori Host, and similar) whose egg runs
// `node <MAIN_FILE>` against a freshly cloned repo. Set the panel's MAIN_FILE to
// `panel-start.mjs`. This is NOT needed for Docker or a normal VPS; those use
// `npm start` (`tsx src/cluster.ts`) directly.
//
// It solves the three things those panels get wrong for a TypeScript, tsx-run project:
//   1. Secrets: panels often expose no way to add custom env vars, so we load a `.env`
//      file the operator uploads via the panel Files tab.
//   2. Prisma: panels frequently block npm install scripts, so the Prisma client may be
//      ungenerated and the schema unmigrated. We do both here (idempotent once in sync).
//   3. TypeScript: plain `node` cannot run `.ts` or resolve the `@/` path alias. We run the
//      cluster through the tsx CLI (exactly like `npm start`) and pin TSX_TSCONFIG_PATH so
//      tsx applies the tsconfig `@/` mapping in both the manager and the shard children it
//      spawns with `--import tsx` (they inherit this env). The `--import tsx` loader on its
//      own does NOT read tsconfig paths, which is why a bare `node --import tsx` fails.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 1. Load secrets from an uploaded .env if present (Node 20.12+ built-in, no dependency).
if (existsSync(".env") && typeof process.loadEnvFile === "function") {
	process.loadEnvFile(".env");
}

// 2. Generate the Prisma client and apply migrations. migrate deploy is safe to re-run.
//    Migrations need a session-level advisory lock, which connection POOLERS (e.g.
//    pooled.db.prisma.io, Neon -pooler, Supabase pgbouncer) do not hold - that fails
//    with P1002. So if a direct connection is provided in DIRECT_URL, migrate over it
//    while the running bot keeps using the pooled DATABASE_URL.
const migrateEnv = process.env.DIRECT_URL
	? { ...process.env, DATABASE_URL: process.env.DIRECT_URL }
	: process.env;
try {
	execFileSync("npx", ["prisma", "generate"], { stdio: "inherit" });
	execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: migrateEnv });
} catch (err) {
	console.error(
		"Database setup failed. If you see P1002 (advisory lock), your DATABASE_URL is a pooled\n" +
			"connection - set DIRECT_URL in .env to a direct (non-pooled) Postgres URL for migrations.",
		err instanceof Error ? err.message : err,
	);
	process.exit(1);
}

// 3. Run the cluster through the tsx CLI, with the tsconfig pinned so the `@/` alias
//    resolves in the manager and in the shards it spawns. Forward stop signals so the bot
//    shuts down cleanly when the panel stops the server.
process.env.TSX_TSCONFIG_PATH = fileURLToPath(new URL("./tsconfig.json", import.meta.url));

const child = spawn("npx", ["tsx", "src/cluster.ts"], {
	stdio: "inherit",
	env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
	process.exit(code ?? (signal ? 1 : 0));
});
