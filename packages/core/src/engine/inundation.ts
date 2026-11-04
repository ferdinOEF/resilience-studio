/**
 * On-map flood extent: one water level in metres (audit M11), spread over connected land.
 *
 * Every water cell the hazard reaches carries a water level (m above MSL, EGM2008):
 *   storm tide(RP) + SLR + river stage(x, RP), or the normal high tide (MHHW) + SLR when there is no storm.
 * Water spreads from cell to neighbouring land while the land is lower than the level, so a low point
 * floods only if a continuous path of lower ground joins it to the sea or estuary.
 *
 * Measures act where water first crosses from the water onto a segment's land:
 *   - mangroves lower the storm part by their cm/km × width (McIvor et al. 2012b), at most the surge above MHHW;
 *   - storage lowers the river part by the share of the river volume it holds;
 *   - crest barriers (seawalls, dunes) block the covered shore cells while the level is at or below the crest;
 *   - khazan bunds (the edge of the khazan mask) block water entering khazan land up to the bund crest,
 *     unless the bund-failure scenario is on.
 * Over land, the storm part of the level can drop by an overland attenuation rate (m/km; default 0).
 *
 * Every flooded cell falls in one of three classes (audit M9):
 *   wet at every high tide  below today's normal high tide (MHHW, no SLR) and connected to the water: present-day water or intertidal;
 *                           since Phase 3 (A1) also mangrove and ponds below spring high water, which spring tides reach;
 *   behind bunds            khazan land and the mapped field bunds (Patto, Taleigao), kept dry today by their bunds;
 *   newly flooded           everything else: the headline figure.
 * Other land between MHHW and spring high water that the tide could reach is kept dry today by defences the data
 * does not have (audit A1): it is held like a bund up to the 1-year storm tide, and reported apart while dry.
 */
import { MinHeap, cellLonLat, isBunded, lineLatAt, neighbours, type DerivedArea, type DividingLine } from "./grid";
import { barrierSpec } from "./effects";
import type { Bound, Placement, ScenarioId, SegmentDef, SolutionDef } from "./types";

export interface Scope {
  displayBbox: { lon_min: number; lon_max: number; lat_min: number; lat_max: number };
  side: "north" | "south";
}

/** Land cells inside the study scope: within the display box, on the scoped side of the channel. */
export function scopeMask(area: DerivedArea, scope: Scope, line: DividingLine): Uint8Array {
  const g = area.grid;
  const out = new Uint8Array(g.cols * g.rows);
  const b = scope.displayBbox;
  for (let i = 0; i < out.length; i++) {
    if (area.isWater[i]) continue;
    const [lon, lat] = cellLonLat(g, i);
    if (lon < b.lon_min || lon > b.lon_max || lat < b.lat_min || lat > b.lat_max) continue;
    const north = lat > lineLatAt(line, lon);
    if ((scope.side === "north") === north) out[i] = 1;
  }
  return out;
}

/** Water levels at the water cells, split into the parts the measures act on. */
export interface WaterSource {
  /** normal high tide + SLR (m): the level everywhere the water is connected to the sea */
  baseM: number;
  /** storm surge above the normal high tide (m), uniform over the estuary */
  stormM: number;
  /** river stage above the tide at water cell i (m), 0 where the river does not reach */
  riverAt: (i: number) => number;
  /** whether water cell i is reached at all */
  reached: (i: number) => boolean;
}

/** What a segment's measures take off the water crossing onto its land. */
export interface ShoreCut {
  /** mangrove surge reduction (m), applied to the storm part */
  stormCutM: number;
  /** share of the river part left after storage (0–1) */
  riverKeep: number;
}

export interface FillOptions {
  cellSegment: Int16Array;
  /** per segment index; undefined = no cut */
  cuts?: (ShoreCut | undefined)[];
  /** crest level (m) of a barrier covering each shore cell, −Infinity where none */
  crest?: Float64Array;
  /** khazan bund crest (m), or null when the bunds have failed (or are ignored) */
  bundCrestM: number | null;
  /** overland attenuation of the storm part (m per km) */
  overlandMPerKm: number;
  /**
   * Land kept dry by defences the data does not have (audit A1): water entering these cells from outside them
   * is held up to `crestM`, like a bund. Undefined = no such defence (or it has failed).
   */
  defended?: { mask: Uint8Array; crestM: number };
}

/** Connected fill: the water level reaching every in-scope land cell (−Infinity where dry). */
export function fillLevels(area: DerivedArea, elevM: Float32Array, inScope: Uint8Array, src: WaterSource, o: FillOptions): Float64Array {
  const g = area.grid;
  const n = g.cols * g.rows;
  const level = new Float64Array(n).fill(-Infinity);
  const storm = new Float64Array(n);
  const river = new Float64Array(n);
  const heap = new MinHeap(); // keyed on −level, so the highest water settles first
  for (let i = 0; i < n; i++) {
    if (!area.isFlowPath[i] || !src.reached(i)) continue;
    river[i] = src.riverAt(i);
    storm[i] = src.stormM;
    level[i] = src.baseM + storm[i] + river[i];
    heap.push(-level[i], i);
  }
  const bund = (i: number) => isBunded(g, i);
  const dm = o.defended?.mask;
  const diagKm = Math.hypot(g.dxKm, g.dyKm);
  while (heap.size > 0) {
    const [negL, i] = heap.pop();
    const l = -negL;
    if (l < level[i]) continue;
    const fromWater = area.isFlowPath[i] === 1;
    const ri = Math.floor(i / g.cols), ci = i % g.cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rj = ri + dr, cj = ci + dc;
      if ((!dr && !dc) || rj < 0 || rj >= g.rows || cj < 0 || cj >= g.cols) continue;
      const j = rj * g.cols + cj;
      if (area.isFlowPath[j] || !inScope[j]) continue;
      let lj: number, sj: number;
      if (fromWater) {
        const k = o.cellSegment[j];
        const cut = k >= 0 ? o.cuts?.[k] : undefined;
        const sc = cut ? Math.min(storm[i], cut.stormCutM) : 0;
        lj = l - sc - (cut ? river[i] * (1 - cut.riverKeep) : 0);
        sj = storm[i] - sc;
        // a barrier on this shore cell holds the water at or below its crest; above the crest it is overtopped
        if (o.crest && lj <= o.crest[j]) continue;
      } else {
        const stepKm = dr && dc ? diagKm : dr ? g.dyKm : g.dxKm;
        const drop = Math.min(storm[i], o.overlandMPerKm * stepKm);
        lj = l - drop;
        sj = storm[i] - drop;
      }
      // bunds (khazan and field bunds): water entering bunded land from outside it is held up to the bund crest
      if (o.bundCrestM !== null && bund(j) && (fromWater || !bund(i)) && lj <= o.bundCrestM) continue;
      // unmapped defences: the same rule at their own crest
      if (dm && dm[j] && (fromWater || !dm[i]) && lj <= o.defended!.crestM) continue;
      if (lj > elevM[j] && lj > level[j]) {
        level[j] = lj;
        storm[j] = sj;
        heap.push(-lj, j);
      }
    }
  }
  return level;
}

export interface ExtentResult {
  /** water depth above ground (m) on newly flooded and behind-bund cells, 0 elsewhere */
  depth: Float32Array;
  /** newly flooded: dry at today's high tide, not khazan behind bunds */
  floodedCells: number[];
  /** khazan land behind bunds that the event floods */
  bundedCells: number[];
  /** land wet at every high tide today, inside the event's water */
  wetTideCells: number[];
  /** low land the event leaves dry only because of defences the data does not have (audit A1) */
  defendedCells: number[];
}

/**
 * Sort an event's flooded cells into the three classes against today's tide fill (`tideToday`: the land wet at
 * every high tide, plus mangrove and ponds wet at spring tides). Cells of the `defended` mask the event leaves
 * dry are listed apart: low land kept dry by defences the data does not have.
 */
export function classifyExtent(area: DerivedArea, elevM: Float32Array, inScope: Uint8Array, event: Float64Array, tideToday: Float64Array, defended?: Uint8Array): ExtentResult {
  const n = area.grid.cols * area.grid.rows;
  const depth = new Float32Array(n);
  const floodedCells: number[] = [], bundedCells: number[] = [], wetTideCells: number[] = [], defendedCells: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!inScope[i]) continue;
    if (!(event[i] > elevM[i])) { if (defended?.[i]) defendedCells.push(i); continue; }
    if (tideToday[i] > elevM[i]) { wetTideCells.push(i); continue; }
    depth[i] = event[i] - elevM[i];
    (isBunded(area.grid, i) ? bundedCells : floodedCells).push(i);
  }
  return { depth, floodedCells, bundedCells, wetTideCells, defendedCells };
}

/**
 * Crest level per shore cell from the crest barriers placed (seawalls, dunes that survive erosion).
 * A barrier covering a share of a segment's frontage takes that share of its shore cells, most
 * sea-exposed first (shortest water distance to open sea); the rest stays open, so water can flank it.
 * Barriers on a segment where they are not allowed (siting rules) are ignored.
 */
export function barrierCrests(
  area: DerivedArea,
  placements: Placement[],
  solutions: Record<string, SolutionDef>,
  segDefs: SegmentDef[],
  bound: Bound,
  isAllowed: (sol: SolutionDef, seg: SegmentDef) => boolean
): Float64Array {
  const g = area.grid;
  const crest = new Float64Array(g.cols * g.rows).fill(-Infinity);
  for (const seg of area.segments) {
    const def = segDefs.find((d) => d.id === seg.id);
    const shoreOrder = seg.shoreCells
      .map((i) => ({ i, d: Math.min(...neighbours(g, i, true).filter((j) => area.isFlowPath[j]).map((j) => area.distFromSea[j])) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .map((x) => x.i);
    for (const pl of placements) {
      if (pl.segmentId !== seg.id) continue;
      const sol = solutions[pl.solutionId];
      if (!sol || (!pl.existing && def && !isAllowed(sol, def))) continue;
      const b = barrierSpec(sol, pl, bound);
      if (!b) continue;
      const k = Math.round(b.frontageShare * shoreOrder.length);
      for (let q = 0; q < k; q++) crest[shoreOrder[q]] = Math.max(crest[shoreOrder[q]], b.crestM);
    }
  }
  return crest;
}

/** intertidalKm2: newly flooded mangrove (CRZ-IA) and pond cells: habitat that floods, not land at risk (audit M14, pulled forward) */
type Classes = { floodedKm2: number; bundedKm2: number; wetTideKm2: number; defendedKm2: number; urbanKm2: number; ruralCrzKm2: number; khazanKm2: number; mangroveKm2: number; intertidalKm2: number; people: number; buildings: number };
export interface ExtentSummary extends Classes {
  population: number | null;
  bySegment: Record<string, Classes & { bandKm2: number; population: number | null }>;
}

/**
 * Exposure inside a flood extent: the newly flooded and behind-bund classes (land that is dry at today's
 * high tide). People and buildings are summed over the flooded cells from the exposure grids (GHS-POP 2020;
 * OSM + Microsoft footprints, audit Phase 2). A segment's population is that sum × `popScale` (1 unless the
 * user entered their own segment total); a null scale leaves population uncomputed for that segment.
 * Mangrove and khazan areas are kept for the ecology card, not counted as exposure (audit M14).
 */
export function summarizeExtent(
  area: DerivedArea,
  ext: ExtentResult,
  segmentOfCell: Int16Array,
  popScale: Record<string, number | null>,
  excludeKhazan: Record<string, boolean>,
  grids?: { pop: Float32Array; buildings: Float32Array }
): ExtentSummary {
  const g = area.grid;
  const a = g.data.cellAreaKm2;
  const zero = (): Classes => ({ floodedKm2: 0, bundedKm2: 0, wetTideKm2: 0, defendedKm2: 0, urbanKm2: 0, ruralCrzKm2: 0, khazanKm2: 0, mangroveKm2: 0, intertidalKm2: 0, people: 0, buildings: 0 });
  const bySegment: ExtentSummary["bySegment"] = {};
  for (const s of area.segments) bySegment[s.id] = { ...zero(), bandKm2: s.bandCells.length * a, population: null };
  const tot = zero();
  const segOf = (i: number) => { const k = segmentOfCell[i]; return k >= 0 ? area.segments[k].id : null; };
  const addAll = (cells: number[], key: "floodedKm2" | "bundedKm2" | "wetTideKm2" | "defendedKm2", exposed: boolean) => {
    for (const i of cells) {
      const seg = segOf(i);
      const c = g.cls[i];
      const kz = g.khazan[i] === 1 && !(seg && excludeKhazan[seg]);
      for (const o of seg ? [tot, bySegment[seg]] : [tot]) {
        o[key] += a;
        if (!exposed) continue;
        if (c === "U") o.urbanKm2 += a;
        if (c === "N" || c === "T") o.ruralCrzKm2 += a;
        if (c === "M") o.mangroveKm2 += a;
        if (key === "floodedKm2" && (c === "M" || c === "W")) o.intertidalKm2 += a;
        if (kz) o.khazanKm2 += a;
        if (grids) { o.people += grids.pop[i]; o.buildings += grids.buildings[i]; }
      }
    }
  };
  addAll(ext.floodedCells, "floodedKm2", true);
  addAll(ext.bundedCells, "bundedKm2", true);
  addAll(ext.wetTideCells, "wetTideKm2", false);
  addAll(ext.defendedCells, "defendedKm2", false);
  let pop: number | null = null;
  for (const s of area.segments) {
    const k = popScale[s.id];
    if (k === null || k === undefined || !grids) continue;
    const b = bySegment[s.id];
    b.population = b.people * k;
    pop = (pop ?? 0) + b.population;
  }
  return { ...tot, population: pop, bySegment };
}

/**
 * Water source for a hazard layer (audit M11). The storm tide already contains the tide, so
 * storm tide + SLR = MHHW + SLR + (storm tide − MHHW): the bracket is the storm part.
 *   surge     storm tide(RP) + SLR, on water connected to the sea
 *   flood     MHHW + SLR + river(x, RP), river(x) = stage × exp(−λ_F·d_upstream)
 *   compound  storm tide(RP) + SLR + river(x, RP)
 *   slr       MHHW + SLR
 */
export function waterSource(
  area: DerivedArea,
  scenario: ScenarioId,
  hz: { highTideReferenceM: number; stormTideM: number; riverStageM: number; lambdaFluvialPerKm: number },
  slrM: number
): WaterSource {
  const storms = scenario === "surge" || scenario === "compound";
  const rivers = scenario === "flood" || scenario === "compound";
  return {
    baseM: hz.highTideReferenceM + slrM,
    stormM: storms ? Math.max(0, hz.stormTideM - hz.highTideReferenceM) : 0,
    riverAt: (i) => {
      const d = area.distFromUpstream[i];
      return rivers && Number.isFinite(d) ? hz.riverStageM * Math.exp(-hz.lambdaFluvialPerKm * d) : 0;
    },
    reached: (i) => Number.isFinite(area.distFromSea[i]) || Number.isFinite(area.distFromUpstream[i])
  };
}
