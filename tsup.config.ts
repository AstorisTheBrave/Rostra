import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/cluster.ts", "src/bot.ts"],
	format: ["esm"],
	target: "node20",
	platform: "node",
	splitting: false,
	clean: true,
	sourcemap: true,
	dts: false,
});
