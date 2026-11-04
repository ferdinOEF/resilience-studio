/**
 * Place layer loader: validates the manifests under data/ and serves the vector layers they list. Everything is
 * bundled in at build time (no file system on the Vercel function). Raster files (GeoTIFF) are referenced, not served.
 */
import type { FeatureCollection } from "geojson";
import { ManifestSchema, type Layer, type Manifest } from "./schema";
import nationalManifestJson from "../../../data/national/manifest.json";
import panjimManifestJson from "../../../data/places/panjim/manifest.json";
import goaState from "../../../data/national/boundaries/goa_state.geojson";
import goaDistricts from "../../../data/national/boundaries/goa_districts.geojson";
import goaTalukas from "../../../data/national/boundaries/goa_talukas.geojson";
import datameetUnits from "../../../data/national/boundaries/datameet_goa_census2001_units.geojson";
import panjimCity from "../../../data/places/panjim/boundaries/panjim_city_census2001.geojson";
import tiswadiTowns from "../../../data/places/panjim/boundaries/tiswadi_census2001_towns.geojson";
import wardZones from "../../../data/places/panjim/boundaries/ward_zones_landmark.geojson";
import khazanPolygons from "../../../data/places/panjim/khazan/khazan_polygons.geojson";
import fieldBunds from "../../../data/places/panjim/khazan/field_bunds_traced.geojson";
import clauseMap from "../../../data/places/panjim/policy/clause_map.json";
import ddmpFacilities from "../../../data/places/panjim/facilities/ddmp_2022_facilities.json";

export * from "./schema";

export const NATIONAL: Manifest = ManifestSchema.parse(nationalManifestJson);
export const PANJIM_PACK: Manifest = ManifestSchema.parse(panjimManifestJson);

const VECTOR_LAYERS: Record<string, Record<string, FeatureCollection>> = {
  india: {
    gadm_goa_state: goaState as FeatureCollection,
    gadm_goa_districts: goaDistricts as FeatureCollection,
    gadm_goa_talukas: goaTalukas as FeatureCollection,
    datameet_census2001_units: datameetUnits as FeatureCollection
  },
  panjim: {
    city_boundary: panjimCity as FeatureCollection,
    tiswadi_towns: tiswadiTowns as FeatureCollection,
    ward_zones: wardZones as FeatureCollection,
    khazan_polygons: khazanPolygons as FeatureCollection,
    field_bunds: fieldBunds as FeatureCollection
  }
};

const DOCUMENTS: Record<string, Record<string, unknown>> = {
  panjim: { policy_clause_map: clauseMap, ddmp_facilities: ddmpFacilities }
};

export function listPlaces(): { id: string; name: string; level: Manifest["level"]; layers: number; updated_at: string }[] {
  return [NATIONAL, PANJIM_PACK].map((m) => ({ id: m.id, name: m.name, level: m.level, layers: m.layers.length, updated_at: m.updated_at }));
}

export function getManifest(id: string): Manifest | null {
  return id === "india" ? NATIONAL : id === "panjim" ? PANJIM_PACK : null;
}

export function getLayer(placeId: string, layerId: string): { layer: Layer; data: FeatureCollection | Record<string, unknown> } | null {
  const m = getManifest(placeId);
  const layer = m?.layers.find((l) => l.id === layerId);
  if (!m || !layer) return null;
  const data = VECTOR_LAYERS[placeId]?.[layerId] ?? DOCUMENTS[placeId]?.[layerId];
  return data ? { layer, data } : null;
}

/** Layers the studio may draw: supplied or derived, not admin-only, not placeholders. */
export function studioLayers(m: Manifest): Layer[] {
  return m.layers.filter((l) => !l.admin_only && l.status !== "placeholder" && l.status !== "not_yet_supplied" && l.grounding !== "placeholder_needs_calibration");
}

/** Every layer with what it still needs, for DATA_INVENTORY.md and the admin Data page. */
export function inventory(m: Manifest): { id: string; title: string; status: Layer["status"]; grounding: Layer["grounding"]; admin_only: boolean; replaced_by: string | null }[] {
  return m.layers.map((l) => ({ id: l.id, title: l.title, status: l.status, grounding: l.grounding, admin_only: l.admin_only, replaced_by: l.replaced_by }));
}

/** The Goa taluka GADM calls "Panaji Taluk" is Tiswadi; the city view frames Panjim inside it. */
export function tiswadiFootprint(): FeatureCollection {
  const fc = goaTalukas as FeatureCollection;
  return { type: "FeatureCollection", features: fc.features.filter((f) => f.properties?.NAME_3 === "Panaji") };
}
