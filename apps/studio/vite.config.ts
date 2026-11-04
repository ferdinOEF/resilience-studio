import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
  preview: { port: 4179, strictPort: true },
  test: { globals: true, environment: "node" }
});
