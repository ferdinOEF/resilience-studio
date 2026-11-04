import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // API_PROXY overrides the API origin when port 3000 is taken locally, e.g. API_PROXY=http://localhost:3100.
  // changeOrigin stays off so the API sees the studio's Host header and builds magic links on the studio origin.
  server: { port: 5173, proxy: { "/api": { target: process.env.API_PROXY ?? "http://localhost:3000", changeOrigin: false } } },
  preview: { port: 4179, strictPort: true },
  test: { globals: true, environment: "node" }
});
