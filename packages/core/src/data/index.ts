/** Typed access to the JSON data files. All numbers live in JSON, none here. */
import solutionsJson from "./solutions.json";
import hazardsJson from "./hazards.json";
import citationsJson from "./citations.json";
import areasJson from "./caseStudyAreas.json";
import rubricJsonData from "./feasibilityRubric.json";
import panjimGrid from "./panjimCrzGrid.json";
import defensesJson from "./existingDefenses.json";
import damageJson from "./damage.json";
import ecologyJson from "./ecology.json";
import sviJson from "./svi.json";
import popGridJson from "./panjimPopGrid.json";
import exposureGridJson from "./panjimExposureGrid.json";
import panjimDemGlo30 from "./panjimDemGrid.json";
import panjimDemDeltaDtm from "./panjimDemGrid.deltadtm.json";
import panjimSource from "./panjim_mandovi_case_study.json";
import { deriveArea, loadGrid, type AreaConfig, type GridData } from "../engine/grid";
import { scopeMask, type Scope } from "../engine/inundation";
import { ASSET_CLASSES, SVI_CLASSES, type AssetClass, type DamageModel, type ExposureGrids, type SviClass } from "../engine/impact";
import { deriveBaseline, defaultExposure, type HazardValues, type ModelContext } from "../engine/model";
import { deriveCatchments, type CatchmentDef } from "../engine/rain";
import type { Bound, Grounding, HazardParams, Param, Placement, ReturnPeriod, ScenarioId, SegmentDef, SolutionDef } from "../engine/types";

export interface Citation {
  short: string;
  full: string;
  usedFor: string;
  provenance: "prior_project" | "build_spec" | "this_pass" | "checked_this_pass";
}

export const CITATIONS = citationsJson.citations as Record<string, Citation>;
export const SOLUTIONS = solutionsJson.solutions as unknown as SolutionDef[];
export const SOLUTION_BY_ID: Record<string, SolutionDef> = Object.fromEntries(SOLUTIONS.map((s) => [s.id, s]));
export const DROPPED = solutionsJson.dropped;

export const HAZARD_PARAMS = hazardsJson.params as unknown as HazardParams;
export const HAZARD_COMPONENTS = hazardsJson.components;
export const SCENARIOS = hazardsJson.scenarios as { id: ScenarioId; name: string; description: string; formula: string }[];

type AreaJson = (typeof areasJson.areas)[number];
export type CaseStudyArea = AreaJson & AreaConfig;
export const AREA = areasJson.areas[0] as unknown as CaseStudyArea;
export const AREA_SOURCE = panjimSource;
export const GRID_DATA = panjimGrid as unknown as GridData & {
  areaCheck: Record<string, { grid_km2: number; published_km2: number }>;
  grounding_note: string;
};

export const GRID = loadGrid(GRID_DATA);
export const DERIVED = deriveArea(GRID, AREA);

export const SCOPE = (AREA as unknown as { scope: Scope & { note: string } }).scope;
export const DROPPED_SEGMENTS = (AREA as unknown as { droppedSegments: { id: string; name: string; reason: string }[] }).droppedSegments;
/** Land cells in the Panjim study scope (display box, Panjim side of the channel). */
export const IN_SCOPE = scopeMask(DERIVED, SCOPE, AREA.dividingLine);

/**
 * Terrain model (audit M8). One line picks the DEM grid the whole tool uses:
 *   "glo30"     Copernicus GLO-30 (a surface model: buildings and canopy included), src/data/panjimDemGrid.json
 *   "deltadtm"  DeltaDTM v1.1 (Pronk et al. 2024, bare-earth coastal DTM), src/data/panjimDemGrid.deltadtm.json,
 *               built by `node tools/build_dem_grid.mjs --source deltadtm data/source/deltadtm/DeltaDTM_Mandovi_EPSG4326.tif`
 *               from the tile Ferdin supplied (4TU.ResearchData was unreachable). Pixels above 10 m are outside
 *               DeltaDTM's domain and dropped; those cells keep GLO-30 (docs/model-audit/LOG.md, DeltaDTM switch).
 */
export const DEM_SOURCE = "deltadtm" as "glo30" | "deltadtm";
const panjimDem = DEM_SOURCE === "glo30" ? panjimDemGlo30 : panjimDemDeltaDtm;
export const DEM = panjimDem;
/** How the UI names the terrain model in use, and its citations. */
export const DEM_LABEL = DEM_SOURCE === "glo30"
  ? "Copernicus GLO-30 (30 m surface model)"
  : "DeltaDTM v1.1 (30 m bare-earth coastal terrain model, below 10 m; GLO-30 above)";
export const DEM_CITATIONS = DEM_SOURCE === "glo30" ? ["copernicus_glo30", "esri_elevation"] : ["pronk2024_deltadtm", "copernicus_glo30"];
export const DEFENSES = defensesJson as unknown as {
  source: string; method: string; grounding_quality: Grounding; grounding_note: string; prior1991Policy: string;
  notExtracted: { type: string; reason: string }[];
  sluiceGateCandidates: { lat: number; lon: number; waterShare: number }[];
};
/** Elevation (m, EGM2008) per grid cell, decoded from the DEM grid file. */
export const ELEV_M: Float32Array = (() => {
  const bin = atob(panjimDem.elevation);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const cm = new Int16Array(bytes.buffer);
  const out = new Float32Array(cm.length);
  for (let i = 0; i < cm.length; i++) out[i] = cm[i] === panjimDem.nodata ? Infinity : cm[i] / 100;
  return out;
})();

/**
 * Field bunds outside the khazan mask (audit A1, Phase 3): Ferdin's ground truth that the Patto, Taleigao and
 * St Inez / Merces fields are bunded. The fields are traced polygons (tools/trace_field_bunds.py: open, unbuilt, low
 * land in Sentinel-2 and the building footprints); a cell whose centre lies inside the rings (even-odd: the rings
 * include holes, and a field can cross from one area into the next), in scope, of the listed classes, outside the
 * khazan mask, with ground at or below spring high water, joins the khazan land behind the bunds (same crest, same
 * toggle). Cells are counted by the area box holding their centre.
 */
export const FIELD_BUNDS = (AREA as unknown as {
  fieldBunds: {
    label: string; grounding: Grounding; citations: string[]; note: string; classes: string[];
    boxes: { id: string; name: string; box: [number, number, number, number] }[];
    polygons: { area: string; ring: [number, number][] }[];
    trace: { method: string; imagery: string; cells: number; cellsAtOrBelowSpringHighWater: number; rings: number; cellsByArea: Record<string, number> };
  };
}).fieldBunds;
function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let ins = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const [xi, yi] = ring[k], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) ins = !ins;
  }
  return ins;
}
export const FIELD_BUND_CELLS: Record<string, number> = (() => {
  const springM = HAZARD_PARAMS.springHighWaterM.value;
  const classes = new Set(FIELD_BUNDS.classes);
  const counts: Record<string, number> = Object.fromEntries(FIELD_BUNDS.boxes.map((b) => [b.id, 0]));
  const rings = FIELD_BUNDS.polygons.map((p) => p.ring);
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    if (!IN_SCOPE[i] || DERIVED.isFlowPath[i] || GRID.khazan[i] || !classes.has(GRID.cls[i]) || !(ELEV_M[i] <= springM)) continue;
    const lon = GRID.data.bbox.lon_min + ((i % GRID.cols) + 0.5) * GRID.data.cellDeg;
    const lat = GRID.data.bbox.lat_max - (Math.floor(i / GRID.cols) + 0.5) * GRID.data.cellDeg;
    if (rings.filter((r) => inRing(lon, lat, r)).length % 2 === 0) continue;
    const area = FIELD_BUNDS.boxes.find(({ box: [x0, x1, y0, y1] }) => lon >= x0 && lon < x1 && lat >= y0 && lat < y1);
    if (!area) continue;
    GRID.fieldBund[i] = 1;
    counts[area.id]++;
  }
  return counts;
})();

/** Segment index for every shore and hinterland cell (−1 outside all segments). */
export const CELL_SEGMENT: Int16Array = (() => {
  const out = new Int16Array(GRID.cols * GRID.rows).fill(-1);
  DERIVED.segments.forEach((s, k) => {
    for (const i of s.bandCells) out[i] = k;
    for (const i of s.shoreCells) out[i] = k;
  });
  return out;
})();

/** Census population (brief §5): since Phase 2 a check on the gridded population, no longer spread over the segments. */
export const POPULATION = (AREA as unknown as {
  population: {
    total: number; year: number; coverage: string; allocation: string; grounding: Grounding; citations: string[]; note: string;
    rescale: { label: string; grounding: Grounding; citations: string[]; note: string; growthFactor: Param; groups: { name: string; codes: string[] }[] };
  };
}).population;

/* ---------------------------------------------------------------- exposure grids (audit Phase 2, P2.1) */

const b64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const N_CELLS = GRID.cols * GRID.rows;
const sparse = (pairs: number[], scale: number) => { const out = new Float32Array(N_CELLS); for (let k = 0; k < pairs.length; k += 2) out[pairs[k]] = pairs[k + 1] / scale; return out; };
export const POP_GRID = popGridJson as unknown as {
  source: Record<string, string>; grounding_quality: Grounding; grounding_note: string;
  stats: { windowTotal: number };
  /** GHS-POP people in each census town, whole and inside the grid window (audit A8) */
  censusTowns: Record<string, { ghsWhole: number; ghsInWindow: number; windowShare: number }>;
};
export const EXPOSURE_GRID = exposureGridJson as unknown as {
  source: Record<string, string>; stats: { buildings: Record<string, number>; roadKm: number }; roadWidthM: Record<string, number>;
  grounding_quality: Grounding; grounding_note: string; censusUnitCodes: string[];
};
export const SVI = sviJson as unknown as {
  grounding: Grounding; citations: string[]; indicators: Record<string, string>; method: string; note: string;
  units: { code2001: string; id: string; name: string; population2011: number; illiteracy7plus: number; children0to6: number; casualWorkerShare: number; index: number; class: SviClass }[];
};
const exg = exposureGridJson as unknown as Record<string, number[]> & { scale: Record<string, number> };
/** People per census-town group before and after the A8 rescale (Phase 3), for the log and Methodology. */
export const POP_RESCALE: { name: string; census2011: number; target: number; ghsBefore: number; zeroed: number; factor: number }[] = [];
export const GRIDS: ExposureGrids = (() => {
  const popU = new Uint32Array(b64(popGridJson.population).buffer);
  const pop = Float32Array.from(popU, (v) => v / 100);
  const unit = sparse(exg.censusUnit, 1);
  // audit A8: nobody lives on khazan paddy or in the mangrove; then each census-town group sums to its census total
  const rs = POPULATION.rescale;
  const ghsBefore = new Map<string, number>();
  for (let i = 0; i < N_CELLS; i++) {
    const code = unit[i] > 0 ? EXPOSURE_GRID.censusUnitCodes[unit[i] - 1] : "";
    ghsBefore.set(code, (ghsBefore.get(code) ?? 0) + pop[i]);
    if (GRID.khazan[i] || GRID.cls[i] === "M") pop[i] = 0;
  }
  for (const grp of rs.groups) {
    const idx = grp.codes.map((c) => EXPOSURE_GRID.censusUnitCodes.indexOf(c) + 1);
    const census = grp.codes.reduce((a, c) => a + SVI.units.find((u) => u.code2001 === c)!.population2011, 0);
    const target = grp.codes.reduce((a, c) => a + SVI.units.find((u) => u.code2001 === c)!.population2011 * POP_GRID.censusTowns[c].windowShare, 0) * rs.growthFactor.value;
    let sum = 0;
    for (let i = 0; i < N_CELLS; i++) if (idx.includes(unit[i])) sum += pop[i];
    const factor = sum > 0 ? target / sum : 1;
    for (let i = 0; i < N_CELLS; i++) if (idx.includes(unit[i])) pop[i] *= factor;
    const before = grp.codes.reduce((a, c) => a + (ghsBefore.get(c) ?? 0), 0);
    POP_RESCALE.push({ name: grp.name, census2011: census, target, ghsBefore: before, zeroed: before - sum, factor });
  }
  const classOfUnit = EXPOSURE_GRID.censusUnitCodes.map((code) => SVI_CLASSES.indexOf(SVI.units.find((u) => u.code2001 === code)!.class));
  return {
    pop,
    m2: {
      residential: sparse(exg.residentialM2, exg.scale.residentialM2), commercial: sparse(exg.commercialM2, exg.scale.commercialM2),
      industrial: sparse(exg.industrialM2, exg.scale.industrialM2), roads: sparse(exg.roadM2, exg.scale.roadM2)
    },
    agriHa: sparse(exg.agricultureHa, exg.scale.agricultureHa),
    buildings: sparse(exg.buildings, exg.scale.buildings),
    svi: Int8Array.from(unit, (u) => (u > 0 ? classOfUnit[u - 1] : -1))
  };
})();
/** Share of each cell under roofs and roads (0–1), for runoff and mangrove migration. */
export const BUILT_SHARE: Float32Array = (() => {
  const cellM2 = GRID.data.cellAreaKm2 * 1e6;
  const m = GRIDS.m2;
  return Float32Array.from({ length: N_CELLS }, (_, i) => Math.min(1, (m.residential[i] + m.commercial[i] + m.industrial[i] + m.roads[i]) / cellM2));
})();

/** People per segment's hinterland band (in scope), from GHS-POP 2020. */
export const SEGMENT_POPULATION: Record<string, number> = Object.fromEntries(
  DERIVED.segments.map((s) => [s.id, defaultExposure(s, GRIDS, IN_SCOPE).population ?? 0])
);
export const POPULATION_IN_SCOPE = Math.round(GRIDS.pop.reduce((a, v, i) => a + (IN_SCOPE[i] ? v : 0), 0));

/** Depth-damage model (Huizinga et al. 2017, Asia; India's maximum damage at 2024 prices). */
export const DAMAGE = damageJson as unknown as DamageModel & {
  _readme: string; priceYear: number;
  conversion: { inrPerUsd2010: number; eurPerUsd2010: number; inrPerEur2010: number; gdpDeflator2010to: number; inrPerEur2010AtPriceYear: number };
  curves: Record<AssetClass, { depthM: number[]; factor: number[]; label: string; grounding: Grounding; citations: string[]; note: string }>;
  peopleAffectedDepthM: Param;
};
export { ASSET_CLASSES };
export const ECOLOGY = ecologyJson as unknown as { mangroveMigrationM: Param; builtBlockShare: Param };

/* ---------------------------------------------------------------- rain at high tide (audit M15) */

export const RAIN = (AREA as unknown as { rain: { note: string; catchments: (CatchmentDef & { osmWays: number[] })[]; existingMeasures: Placement[]; subCatchmentKm2: Param } }).rain;
/** hollows store rain only inside DeltaDTM's domain (≤ 10 m); above it they are terrain-model artefacts (audit A4) */
export const CATCHMENTS = deriveCatchments(DERIVED, ELEV_M, IN_SCOPE, RAIN.catchments, RAIN.subCatchmentKm2.value, DEM_SOURCE === "deltadtm" ? 10 : Infinity);
export const RAIN_DEPTH = hazardsJson.rainDepthByRp as unknown as Record<`${ReturnPeriod}`, Param> & { _note: string };
/** Grid cell holding a lon/lat (−1 outside the grid). */
export function cellAt(lon: number, lat: number): number {
  const g = GRID.data;
  const c = Math.floor((lon - g.bbox.lon_min) / g.cellDeg), r = Math.floor((g.bbox.lat_max - lat) / g.cellDeg);
  return r >= 0 && r < GRID.rows && c >= 0 && c < GRID.cols ? r * GRID.cols + c : -1;
}
/** Today's measures: those derived from the data, plus the listed existing drainage (Mala). */
export const BASELINE_MEASURES: Placement[] = deriveBaseline(DERIVED, RAIN.existingMeasures);

export const EXCLUDE_KHAZAN: Record<string, boolean> = Object.fromEntries(
  (AREA.segments as SegmentDef[]).map((s) => [s.id, !!s.excludeKhazan])
);

export type SlrHorizon = "today" | "2050" | "2100";
export type SspId = "ssp126" | "ssp245" | "ssp585";
type SlrTable = Record<"2050" | "2100", Record<SspId, [number, number, number]>>;
export const SLR = hazardsJson.seaLevelRise as unknown as {
  label: string; grounding: Grounding; citations: string[]; note: string;
  station: { psmslId: number; name: string; url: string; accessed: string };
  horizons: SlrTable;
  sspLabels: Record<SspId, string>;
  /** the global-mean values, kept for Reference */
  global: { label: string; grounding: Grounding; citations: string[]; note: string; horizons: SlrTable };
};
/** Sea-level rise at Mormugao (m): central (median) and likely range. "today" = none. */
export function slrValues(h: SlrHorizon, ssp: SspId) {
  if (h === "today") return { central: 0, lowRise: 0, highRise: 0 };
  const [central, lo, hi] = SLR.horizons[h][ssp];
  return { central, lowRise: lo, highRise: hi };
}

/** Return periods of the storm tide and river stage (audit M5). */
export const RETURN_PERIODS = hazardsJson.returnPeriods.values as ReturnPeriod[];
export const RETURN_PERIOD_NOTE = hazardsJson.returnPeriods.note;
export const DEFAULT_RP: ReturnPeriod = 100;
export const STORM_TIDE = hazardsJson.stormTideByRp as unknown as Record<`${ReturnPeriod}`, Param> & {
  source: { dataset: string; doi: string; pointId: string; lon: number; lat: number; distanceFromMouthKm: number; gumbelLocationM: number; gumbelScaleM: number; accessed: string };
};
export const RIVER_STAGE = hazardsJson.riverStageByRp as unknown as Record<`${ReturnPeriod}`, Param>;

/** Every hazard input at a return period, as data-file parameters (the scalar ones plus the RP-dependent ones). */
export function hazardParamsAt(rp: ReturnPeriod = DEFAULT_RP): Record<keyof HazardValues, Param> {
  return { ...HAZARD_PARAMS, defendedCrestM: STORM_TIDE["1"], stormTideM: STORM_TIDE[`${rp}`], riverStageM: RIVER_STAGE[`${rp}`], rainDepthMm: RAIN_DEPTH[`${rp}`], peopleAffectedDepthM: DAMAGE.peopleAffectedDepthM };
}

/**
 * Hazard inputs at a bound (audit M4). "central" = the central values; "low" = the most hazardous end of
 * every input that has a range (the least favourable run, matching the solution bounds' naming);
 * "high" = the least hazardous end. An input the user has overridden stays at that value in every bound.
 */
export function hazardValues(overrides: Partial<HazardValues> = {}, bound: Bound = "central", rp: ReturnPeriod = DEFAULT_RP): HazardValues {
  const v = {} as HazardValues;
  for (const [k, p] of Object.entries(hazardParamsAt(rp)) as [keyof HazardValues, Param][]) v[k] = hazardParamAt(p, bound);
  return { ...v, ...overrides };
}

export function hazardParamAt(p: Param, bound: Bound): number {
  if (bound === "central" || p.low === undefined || p.high === undefined || !p.moreHazardous) return p.value;
  const worst = p.moreHazardous === "higher" ? p.high : p.low;
  const best = p.moreHazardous === "higher" ? p.low : p.high;
  return bound === "low" ? worst : best;
}

/** Hazard inputs that carry a range and enter the bounds. */
export function rangedHazardInputs(rp: ReturnPeriod = DEFAULT_RP): (keyof HazardValues)[] {
  return (Object.entries(hazardParamsAt(rp)) as [keyof HazardValues, Param][])
    .filter(([, p]) => p.low !== undefined && p.high !== undefined && p.moreHazardous)
    .map(([k]) => k);
}

export function modelContext(overrides: Partial<HazardValues> = {}, rp: ReturnPeriod = DEFAULT_RP): ModelContext {
  return {
    area: DERIVED, segDefs: AREA.segments, solutions: SOLUTION_BY_ID,
    elevM: ELEV_M, inScope: IN_SCOPE, cellSegment: CELL_SEGMENT, excludeKhazan: EXCLUDE_KHAZAN,
    hazard: hazardValues(overrides, "central", rp),
    hazardAt: { low: hazardValues(overrides, "low", rp), central: hazardValues(overrides, "central", rp), high: hazardValues(overrides, "high", rp) },
    grids: GRIDS, damage: DAMAGE, catchments: CATCHMENTS, builtShare: BUILT_SHARE, cellAt
  };
}

/** Every citation id referenced by any data file, for the Methodology & Sources panel check. */
export function citationIdsInUse(): Set<string> {
  const ids = new Set<string>();
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (k === "citations" && Array.isArray(v)) v.forEach((id) => ids.add(id as string));
        else walk(v);
      }
    }
  };
  walk(solutionsJson);
  walk(hazardsJson);
  walk(areasJson);
  walk(rubricJsonData);
  walk(damageJson);
  walk(ecologyJson);
  walk(sviJson);
  return ids;
}
