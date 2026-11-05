/**
 * Geometry for the studio and admin maps: a run's flood extent as polygons (the engine's marching squares over the
 * 55 m grid), and per-zone aggregates of a run (cells whose centre falls in a zone). No new parameters: depth bands and
 * classes are reported as measured; the zone rating is a rank among zones, named as such.
 */
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { GRID, GRID_DATA, GRIDS, vectorizeClasses } from "@resilience/core";
import type { RunRecord } from "@resilience/meta-mind";

const bb = GRID_DATA.bbox;
const D = GRID_DATA.cellDeg;
const toLonLat = ([x, y]: [number, number]): [number, number] => [Math.round((bb.lon_min + x * D) * 1e6) / 1e6, Math.round((bb.lat_max - y * D) * 1e6) / 1e6];

export const DEPTH_BAND_M = 0.5;

/** Flood extent of a run's headline event (central bound) as polygons: class 1 = depth under the band, 2 = at or over it; behind-bund cells carry bunded: true. */
export function extentGeoJSON(run: RunRecord): FeatureCollection {
  const cells = run.result?.depth_cells ?? [];
  const depth = new Float32Array(GRID.cols * GRID.rows);
  const cls = new Uint8Array(GRID.cols * GRID.rows);
  for (const c of cells) { depth[c.index] = c.depth_m; cls[c.index] = c.cls; }
  const features: Feature[] = [];
  for (const bunded of [false, true]) {
    const polys = vectorizeClasses(GRID.cols, GRID.rows, (c, r) => {
      const i = r * GRID.cols + c;
      if (!cls[i] || (cls[i] === 2) !== bunded) return -1;
      return depth[i] >= DEPTH_BAND_M ? 2 : 1;
    });
    for (const [k, list] of polys) for (const poly of list) {
      features.push({ type: "Feature", properties: { band: k, depth_at_least_m: k === 2 ? DEPTH_BAND_M : 0, bunded, run_id: run.id, return_period: run.result?.headline_return_period ?? null, bound: "central" }, geometry: { type: "Polygon", coordinates: poly.map((ring) => { const r = ring.map(toLonLat).reverse(); r.push(r[0]); return r; }) } });
    }
  }
  return { type: "FeatureCollection", features };
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeometry(x: number, y: number, g: Polygon | MultiPolygon): boolean {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

export interface ZoneStats {
  id: string;
  name: string;
  cells: number;
  /** people and buildings living in the zone (all cells), from the exposure grids */
  people_total: number;
  buildings_total: number;
  /** the run's headline event, central bound */
  flooded_cells: number;
  flooded_km2: number;
  bunded_km2: number;
  people_in_flood: number;
  buildings_in_flood: number;
  depth_mean_m: number | null;
  depth_max_m: number | null;
  /** share of the zone's people in flooded cells */
  people_share: number;
  /** social vulnerability: share of the zone's cells in the higher SVI class (higher social vulnerability) */
  svi_higher_share: number;
  rank: number;
  /** rank class among zones: 4 = top quarter by people in flood, 1 = bottom quarter; a rank, not a sourced rating */
  rank_class: 1 | 2 | 3 | 4;
}

/** Aggregate a run's headline event over zones. Cell membership = cell centre inside the zone geometry. */
export function zoneStats(run: RunRecord, zones: FeatureCollection): { method: string; zones: ZoneStats[] } {
  const cells = run.result?.depth_cells ?? [];
  const byIndex = new Map(cells.map((c) => [c.index, c]));
  const cellKm2 = GRID_DATA.cellAreaKm2;
  const out: ZoneStats[] = [];
  for (const f of zones.features) {
    const g = f.geometry as Polygon | MultiPolygon;
    const props = (f.properties ?? {}) as { id?: string; name?: string };
    let n = 0, people = 0, bld = 0, fl = 0, bd = 0, pf = 0, bf = 0, dsum = 0, dmax = 0, lower = 0;
    for (let i = 0; i < GRID.cols * GRID.rows; i++) {
      const lon = bb.lon_min + ((i % GRID.cols) + 0.5) * D, lat = bb.lat_max - (Math.floor(i / GRID.cols) + 0.5) * D;
      if (!pointInGeometry(lon, lat, g)) continue;
      n++; people += GRIDS.pop[i]; bld += GRIDS.buildings[i];
      if (GRIDS.svi[i] === 2) lower++;
      const c = byIndex.get(i);
      if (!c) continue;
      if (c.cls === 3) fl++; else if (c.cls === 2) bd++;
      pf += GRIDS.pop[i]; bf += GRIDS.buildings[i]; dsum += c.depth_m; if (c.depth_m > dmax) dmax = c.depth_m;
    }
    const wet = fl + bd;
    out.push({ id: props.id ?? "zone", name: props.name ?? "zone", cells: n, people_total: Math.round(people), buildings_total: Math.round(bld), flooded_cells: wet, flooded_km2: Math.round(fl * cellKm2 * 1e4) / 1e4, bunded_km2: Math.round(bd * cellKm2 * 1e4) / 1e4, people_in_flood: Math.round(pf), buildings_in_flood: Math.round(bf), depth_mean_m: wet ? Math.round((dsum / wet) * 100) / 100 : null, depth_max_m: wet ? Math.round(dmax * 100) / 100 : null, people_share: people ? Math.round((pf / people) * 1000) / 1000 : 0, svi_higher_share: n ? Math.round((lower / n) * 1000) / 1000 : 0, rank: 0, rank_class: 1 });
  }
  out.sort((a, b) => b.people_in_flood - a.people_in_flood || b.flooded_km2 - a.flooded_km2);
  out.forEach((z, k) => { z.rank = k + 1; z.rank_class = (4 - Math.min(3, Math.floor((k / out.length) * 4))) as 1 | 2 | 3 | 4; });
  return { method: "zones ranked by people in the flooded cells of the run's headline event (central bound); rank_class is the quarter of that ranking, not a sourced risk rating", zones: out };
}

/** CRZ classification areas as polygons (marching squares over the CZMP grid), one feature per class patch. */
export function crzClassesGeoJSON(): FeatureCollection {
  const classes = Array.from(new Set(Array.from(GRID.cls))).filter((k) => k && k !== "-" && k !== "" && k !== "?");
  const index = new Map(classes.map((k, i) => [k, i]));
  const polys = vectorizeClasses(GRID.cols, GRID.rows, (c, r) => { const k = GRID.cls[r * GRID.cols + c]; return index.has(k) ? index.get(k)! : -1; });
  const features: Feature[] = [];
  for (const [k, list] of polys) for (const poly of list) {
    features.push({ type: "Feature", properties: { crz_class: classes[k], khazan: false }, geometry: { type: "Polygon", coordinates: poly.map((ring) => { const r = ring.map(toLonLat).reverse(); r.push(r[0]); return r; }) } });
  }
  return { type: "FeatureCollection", features };
}
