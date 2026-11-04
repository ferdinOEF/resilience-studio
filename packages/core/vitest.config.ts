import { defineConfig } from "vitest/config";

// the Panjim grids are loaded once per worker; the vectorize and risk tests need more than the 5 s default
export default defineConfig({ test: { globals: true, environment: "node", testTimeout: 60000 } });
