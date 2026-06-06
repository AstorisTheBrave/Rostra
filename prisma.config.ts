import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the datasource connection URL out of schema.prisma and into this
// config file (used by the Prisma CLI for migrations). The app runtime gets its URL
// from the validated `config` loader instead (see src/services/database.ts), so this
// file is tooling-only. `dotenv/config` loads .env locally; in CI/Docker DATABASE_URL
// is already present in the environment.
export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: env("DATABASE_URL"),
	},
});
