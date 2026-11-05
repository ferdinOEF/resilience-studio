/** Place layer API: manifests and vector layers of the national base data and the place packs. */
import { Hono } from "hono";
import { getLayer, getManifest, inventory, listPlaces, studioLayers, tiswadiFootprint } from "@resilience/places";
import { GRID_DATA } from "@resilience/core";
import { crzClassesGeoJSON } from "../studio/geometry";

export const places = new Hono();

places.get("/", (c) => c.json({ places: listPlaces() }));

places.get("/:id", (c) => {
  const m = getManifest(c.req.param("id"));
  if (!m) return c.json({ error: "not found" }, 404);
  return c.json({ manifest: m, studio_layers: studioLayers(m).map((l) => l.id), inventory: inventory(m) });
});

places.get("/:id/layers/:layer", (c) => {
  const admin = c.req.query("admin") === "1";
  const r = getLayer(c.req.param("id"), c.req.param("layer"));
  if (!r) return c.json({ error: "not found" }, 404);
  if (r.layer.admin_only && !admin) return c.json({ error: `${r.layer.id} is admin-only (${r.layer.grounding}, ${r.layer.status})`, code: "admin_only" }, 403);
  c.header("cache-control", "public, max-age=3600");
  return c.json({ layer: r.layer, data: r.data });
});

let crzCache: ReturnType<typeof crzClassesGeoJSON> | null = null;
/** CRZ classification polygons (CZMP Goa, 55 m grid, reasoned_extrapolation) with the class legend. */
places.get("/panjim/crz_classes", (c) => {
  crzCache ??= crzClassesGeoJSON();
  c.header("cache-control", "public, max-age=3600");
  return c.json({ classes: GRID_DATA.classes, grounding: "reasoned_extrapolation", source: "Goa CZMP (NCSCM, CRZ Notification 2011), colour-classified raster gridded at 55 m; see docs/DATA_INVENTORY.md", data: crzCache });
});

places.get("/panjim/frame/tiswadi", (c) => {
  c.header("cache-control", "public, max-age=3600");
  return c.json({ data: tiswadiFootprint() });
});
