import { defineConfig } from "tsup";

// the manifests and vector layers under data/ are bundled in, so the API function and the studio need no file system
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "es2022",
  platform: "neutral",
  external: ["zod"],
  loader: { ".geojson": "json" }
});
