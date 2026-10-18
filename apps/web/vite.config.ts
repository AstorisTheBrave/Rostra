import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: { port: 3002 },
	plugins: [tanstackStart(), react()],
});
