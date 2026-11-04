/**
 * Khazan polygons from the CRZ grid's khazan mask (CZMP hatch, colour-classified in the old repo, placeholder_needs_calibration),
 * vectorised with the engine's marching squares (coordinates come back in cell units, y down).
 * Also writes the traced field-bund polygons (Phase 3, A1) as GeoJSON.
 *   npx tsx packages/core/tools/khazan_polygons.ts
 */
import { writeFileSync } from "node:fs";
import { FIELD_BUNDS, GRID, GRID_DATA, vectorizeClasses } from "../src/index";

const g = GRID;
const polys = vectorizeClasses(g.cols, g.rows, (c, r) => (g.khazan[r * g.cols + c] ? 1 : -1));
const bb = GRID_DATA.bbox, D = GRID_DATA.cellDeg;
const toLonLat = ([x, y]: [number, number]): [number, number] => [Math.round((bb.lon_min + x * D) * 1e6) / 1e6, Math.round((bb.lat_max - y * D) * 1e6) / 1e6];
const features: unknown[] = [];
for (const [, list] of polys) for (const poly of list) features.push({ type: "Feature", properties: { id: `khazan-${features.length + 1}`, grounding: "placeholder_needs_calibration", source: "CZMP Goa khazan hatch, colour-classified and morphologically closed in the old repo; polygon edges traced at the 55 m grid; needs a manual review pass (docs/PANAJI_PILOT_DATA_INVENTORY.md)" }, geometry: { type: "Polygon", coordinates: poly.map((ring) => { const r = ring.map(toLonLat).reverse(); if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]); return r; }) } });
writeFileSync(new URL("../../../data/places/panjim/khazan/khazan_polygons.geojson", import.meta.url), JSON.stringify({ type: "FeatureCollection", name: "khazan_polygons", crs_note: "EPSG:4326", features }));
console.log("khazan polygons:", features.length);
const fb = FIELD_BUNDS.polygons.map((p, i) => ({ type: "Feature", properties: { id: `field-bund-${i + 1}`, area: p.area, grounding: FIELD_BUNDS.grounding, citations: FIELD_BUNDS.citations, source: FIELD_BUNDS.trace.method, imagery: FIELD_BUNDS.trace.imagery }, geometry: { type: "Polygon", coordinates: [[...p.ring, p.ring[0]]] } }));
writeFileSync(new URL("../../../data/places/panjim/khazan/field_bunds_traced.geojson", import.meta.url), JSON.stringify({ type: "FeatureCollection", name: "field_bunds_traced", crs_note: "EPSG:4326", note: FIELD_BUNDS.note, features: fb }));
console.log("field-bund polygons:", fb.length);
