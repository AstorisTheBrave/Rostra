import { defineConfig } from "prisma/config";

// Client generation needs the schema, never a deployment URL or local credentials.
export default defineConfig({ schema: "../prisma/schema.prisma" });
