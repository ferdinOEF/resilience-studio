import { defineConfig, type Plugin } from "vitest/config";

/** .geojson files are JSON modules here, as tsup's json loader makes them in the build. */
const geojson: Plugin = {
  name: "geojson-as-json",
  enforce: "pre",
  transform(code, id) {
    if (id.endsWith(".geojson")) return { code: `export default ${code};`, map: null };
    return null;
  }
};

export default defineConfig({ plugins: [geojson], test: { globals: true, environment: "node" } });
