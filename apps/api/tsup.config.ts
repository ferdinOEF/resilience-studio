import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node22",
  platform: "node",
  // workspace packages are bundled in; third-party runtime deps stay external and are traced by Vercel
  noExternal: [/^@resilience\//]
});
