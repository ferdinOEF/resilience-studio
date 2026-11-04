/**
 * The case-study area's CRZ class grid, and everything derived from it:
 * shoreline segments, their hinterland bands, and the travel-distance fields
 * the hazard propagation uses. Pure logic, no UI.
 */
import type { SegmentDef, SegmentStats } from "./types";

export interface GridData {
  bbox: { lon_min: number; lon_max: number; lat_min: number; lat_max: number };
  cellDeg: number;
  cols: number;
  rows: number;
  cellAreaKm2: number;
  classes: Record<string, string>;
  grid: string[];
  khazanMask: string[];
}

export interface Grid {
  data: GridData;
  cols: number;
  rows: number;
  /** class code per cell, row-major */
  cls: string[];
  khazan: Uint8Array;
  /**
   * Bund-protected land outside the khazan mask (audit A1, Phase 3: the Patto and Taleigao fields).
   * DEM-derived, so it is set by the data layer after loading; all zero until then.
   */
  fieldBund: Uint8Array;
  dxKm: number;
  dyKm: number;
  cellEdgeKm: number;
}

export function loadGrid(data: GridData): Grid {
  const cls: string[] = [];
  const khazan = new Uint8Array(data.cols * data.rows);
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      cls.push(data.grid[r][c]);
      khazan[r * data.cols + c] = data.khazanMask[r][c] === "1" ? 1 : 0;
    }
  }
  const latC = ((data.bbox.lat_min + data.bbox.lat_max) / 2) * (Math.PI / 180);
  const dxKm = data.cellDeg * 111.32 * Math.cos(latC);
  const dyKm = data.cellDeg * 110.574;
  return { data, cols: data.cols, rows: data.rows, cls, khazan, fieldBund: new Uint8Array(data.cols * data.rows), dxKm, dyKm, cellEdgeKm: Math.sqrt(dxKm * dyKm) };
}

/** Land behind bunds: the khazan mask plus the field bunds (both share the bund crest and the failure toggle). */
export function isBunded(g: Grid, i: number): boolean {
  return g.khazan[i] === 1 || g.fieldBund[i] === 1;
}

export function cellLonLat(g: Grid, i: number): [number, number] {
  const r = Math.floor(i / g.cols);
  const c = i % g.cols;
  return [g.data.bbox.lon_min + (c + 0.5) * g.data.cellDeg, g.data.bbox.lat_max - (r + 0.5) * g.data.cellDeg];
}

const N8: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

export function neighbours(g: Grid, i: number, n4 = false): number[] {
  const r = Math.floor(i / g.cols);
  const c = i % g.cols;
  const out: number[] = [];
  for (let k = 0; k < (n4 ? 4 : 8); k++) {
    const rr = r + N8[k][0];
    const cc = c + N8[k][1];
    if (rr >= 0 && rr < g.rows && cc >= 0 && cc < g.cols) out.push(rr * g.cols + cc);
  }
  return out;
}

function stepKm(g: Grid, a: number, b: number): number {
  const dr = Math.abs(Math.floor(a / g.cols) - Math.floor(b / g.cols));
  const dc = Math.abs((a % g.cols) - (b % g.cols));
  return Math.hypot(dr * g.dyKm, dc * g.dxKm);
}

/** Minimal binary heap keyed on distance, for Dijkstra over grid cells. */
export class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    this.k.push(key); this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0], this.v[0]];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length > 0) {
      this.k[0] = lk; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Shortest travel distance (km) from `sources` to every cell reachable
 * through cells where `passable` holds. Unreachable cells get Infinity.
 * `label` optionally carries the source's label (nearest-source assignment).
 */
export function distanceField(
  g: Grid,
  sources: number[],
  passable: (i: number) => boolean,
  sourceLabel?: (i: number) => number
): { dist: Float64Array; label: Int32Array } {
  const n = g.cols * g.rows;
  const dist = new Float64Array(n).fill(Infinity);
  const label = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  for (const s of sources) {
    dist[s] = 0;
    label[s] = sourceLabel ? sourceLabel(s) : 0;
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    for (const j of neighbours(g, i)) {
      if (!passable(j)) continue;
      const nd = d + stepKm(g, i, j);
      if (nd < dist[j]) {
        dist[j] = nd;
        label[j] = label[i];
        heap.push(nd, j);
      }
    }
  }
  return { dist, label };
}

export interface DividingLine { points: [number, number][] }

export function lineLatAt(line: DividingLine, lon: number): number {
  const p = line.points;
  if (lon <= p[0][0]) return p[0][1];
  for (let k = 1; k < p.length; k++) {
    if (lon <= p[k][0]) {
      const t = (lon - p[k - 1][0]) / (p[k][0] - p[k - 1][0]);
      return p[k - 1][1] + t * (p[k][1] - p[k - 1][1]);
    }
  }
  return p[p.length - 1][1];
}

export interface AreaConfig {
  waterClasses: string[];
  surgeSourceClasses: string[];
  fluvialSource: { classes: string[]; edge: "east" | "west" | "north" | "south" };
  lowLyingClasses: string[];
  hinterlandBandKm: { value: number };
  mangroveBandKm: { value: number };
  dividingLine: DividingLine;
  flowConnectors?: { lines: { name: string; points: [number, number][] }[] };
  segments: SegmentDef[];
}

export interface DerivedArea {
  grid: Grid;
  segmentOfShoreCell: Int32Array;
  segments: SegmentStats[];
  /** travel distance (km) through water from the open sea */
  distFromSea: Float64Array;
  /** travel distance (km) through channel water from the upstream edge */
  distFromUpstream: Float64Array;
  isWater: Uint8Array;
  /** water, plus the 1–2-cell gaps (bridges, map linework, thin creeks) water travels through */
  isFlowPath: Uint8Array;
}

/**
 * Cells water can travel through. At ~55 m cells, bridges and map linework
 * drawn over a channel, and narrow creeks, break the classified water into
 * pieces that are hydraulically connected in reality. A non-water cell counts
 * as a flow path when water lies on both opposite sides of it within
 * `maxGap` cells along a row, column or diagonal.
 */
function flowPath(g: Grid, isWater: Uint8Array, gapClasses: Set<string>, maxGap = 2): Uint8Array {
  const n = g.cols * g.rows;
  const out = Uint8Array.from(isWater);
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const waterAt = (r: number, c: number) => r >= 0 && r < g.rows && c >= 0 && c < g.cols && isWater[r * g.cols + c] === 1;
  for (let i = 0; i < n; i++) {
    if (isWater[i] || !gapClasses.has(g.cls[i])) continue;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dr, dc] of dirs) {
      let fwd = false, back = false;
      for (let k = 1; k <= maxGap; k++) {
        if (!fwd && waterAt(r + k * dr, c + k * dc)) fwd = true;
        if (!back && waterAt(r - k * dr, c - k * dc)) back = true;
      }
      if (fwd && back) { out[i] = 1; break; }
    }
  }
  return out;
}

/**
 * Derive shoreline segments and their hinterland statistics from the grid.
 * A shore cell is a non-water cell sharing an edge with water. Each is given
 * to the first segment (in data-file order) whose side and boxes contain it.
 * Hinterland land cells go to the segment of their nearest shore cell,
 * measured over land, within the hinterland band.
 */
export function deriveArea(g: Grid, cfg: AreaConfig): DerivedArea {
  const n = g.cols * g.rows;
  const water = new Set(cfg.waterClasses);
  const isWater = new Uint8Array(n);
  for (let i = 0; i < n; i++) isWater[i] = water.has(g.cls[i]) ? 1 : 0;

  const segmentOfShoreCell = new Int32Array(n).fill(-1);
  const shoreBySeg: number[][] = cfg.segments.map(() => []);
  for (let i = 0; i < n; i++) {
    if (isWater[i]) continue;
    if (!neighbours(g, i, true).some((j) => isWater[j])) continue;
    const [lon, lat] = cellLonLat(g, i);
    const side = lat > lineLatAt(cfg.dividingLine, lon) ? "north" : "south";
    const s = cfg.segments.findIndex(
      (seg) =>
        (seg.side === "any" || seg.side === side) &&
        seg.boxes.some(([x0, x1, y0, y1]) => lon >= x0 && lon < x1 && lat >= y0 && lat < y1)
    );
    if (s >= 0) {
      segmentOfShoreCell[i] = s;
      shoreBySeg[s].push(i);
    }
  }

  const allShore = shoreBySeg.flat();
  const band = distanceField(g, allShore, (i) => !isWater[i], (i) => segmentOfShoreCell[i]);

  const segments: SegmentStats[] = cfg.segments.map((seg, s) => {
    const bandCells: number[] = [];
    const classAreaKm2: Record<string, number> = {};
    let khazanKm2 = 0, lowLyingKm2 = 0, mangroveNearKm2 = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      if (band.label[i] !== s || band.dist[i] > cfg.hinterlandBandKm.value) continue;
      bandCells.push(i);
      const c = g.cls[i];
      classAreaKm2[c] = (classAreaKm2[c] ?? 0) + g.data.cellAreaKm2;
      const kz = !seg.excludeKhazan && g.khazan[i] === 1;
      if (kz) khazanKm2 += g.data.cellAreaKm2;
      if (kz || cfg.lowLyingClasses.includes(c)) lowLyingKm2 += g.data.cellAreaKm2;
      if (c === "M" && band.dist[i] <= cfg.mangroveBandKm.value) mangroveNearKm2 += g.data.cellAreaKm2;
    }
    for (const i of shoreBySeg[s]) {
      const [lon, lat] = cellLonLat(g, i);
      sx += lon; sy += lat;
    }
    const k = Math.max(1, shoreBySeg[s].length);
    const shorelineKm = shoreBySeg[s].length * g.cellEdgeKm;
    return {
      id: seg.id,
      shoreCells: shoreBySeg[s],
      bandCells,
      shorelineKm,
      classAreaKm2,
      khazanKm2,
      lowLyingKm2,
      mangroveBeltM: shorelineKm > 0 ? (mangroveNearKm2 / shorelineKm) * 1000 : 0,
      centroid: [sx / k, sy / k]
    };
  });

  const seaSources: number[] = [];
  const upSources: number[] = [];
  const fluvialClasses = new Set(cfg.fluvialSource.classes);
  const surgeClasses = new Set(cfg.surgeSourceClasses);
  for (let i = 0; i < n; i++) {
    if (surgeClasses.has(g.cls[i])) seaSources.push(i);
    if (fluvialClasses.has(g.cls[i]) && onEdge(g, i, cfg.fluvialSource.edge)) upSources.push(i);
  }
  const isFlowPath = flowPath(g, isWater, new Set([".", "M", "W"]));
  for (const line of cfg.flowConnectors?.lines ?? []) {
    for (const i of rasterizeLine(g, line.points)) isFlowPath[i] = 1;
  }
  const distFromSea = distanceField(g, seaSources, (i) => isFlowPath[i] === 1).dist;
  // The open sea is a sink for river flood: it only travels through channel water.
  const distFromUpstream = distanceField(g, upSources, (i) => isFlowPath[i] === 1 && !surgeClasses.has(g.cls[i])).dist;

  return { grid: g, segmentOfShoreCell, segments, distFromSea, distFromUpstream, isWater, isFlowPath };
}

/** Grid cells along a lon/lat polyline (sampled at quarter-cell steps). */
export function rasterizeLine(g: Grid, pts: [number, number][]): number[] {
  const out = new Set<number>();
  const { lon_min, lat_max } = g.data.bbox;
  const d = g.data.cellDeg;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    const steps = Math.ceil((Math.hypot(x1 - x0, y1 - y0) / d) * 4);
    for (let t = 0; t <= steps; t++) {
      const x = x0 + ((x1 - x0) * t) / steps, y = y0 + ((y1 - y0) * t) / steps;
      const c = Math.floor((x - lon_min) / d), r = Math.floor((lat_max - y) / d);
      if (r >= 0 && r < g.rows && c >= 0 && c < g.cols) out.add(r * g.cols + c);
    }
  }
  return [...out];
}

function onEdge(g: Grid, i: number, edge: "east" | "west" | "north" | "south"): boolean {
  const r = Math.floor(i / g.cols), c = i % g.cols;
  return edge === "east" ? c === g.cols - 1 : edge === "west" ? c === 0 : edge === "north" ? r === 0 : r === g.rows - 1;
}

/**
 * Hazard intensity reaching a segment's shoreline: for each shore cell, the
 * strongest intensity among its adjacent water cells, averaged over the shore
 * cells that component can actually reach. Shore cells beside water
 * fragments the grid leaves disconnected (classification artefacts) are
 * left out rather than counted as zero; `reachedShare` reports how many were
 * reached. Intensity decays exponentially with travel distance: I = exp(−λ·d).
 */
export function segmentHazardFromDistance(
  area: DerivedArea,
  seg: SegmentStats,
  lambdaWave: number,
  lambdaLevel: number,
  lambdaFluvial: number
): { wave: number; level: number; fluvial: number; seaReachedShare: number; upstreamReachedShare: number } {
  const g = area.grid;
  let w = 0, l = 0, f = 0, nSea = 0, nUp = 0;
  for (const i of seg.shoreCells) {
    let dSea = Infinity, dUp = Infinity;
    for (const j of neighbours(g, i)) {
      if (!area.isFlowPath[j]) continue;
      dSea = Math.min(dSea, area.distFromSea[j]);
      dUp = Math.min(dUp, area.distFromUpstream[j]);
    }
    if (isFinite(dSea)) {
      nSea++;
      w += Math.exp(-lambdaWave * dSea);
      l += Math.exp(-lambdaLevel * dSea);
    }
    if (isFinite(dUp)) {
      nUp++;
      f += Math.exp(-lambdaFluvial * dUp);
    }
  }
  const k = seg.shoreCells.length || 1;
  return {
    wave: nSea ? w / nSea : 0,
    level: nSea ? l / nSea : 0,
    fluvial: nUp ? f / nUp : 0,
    seaReachedShare: nSea / k,
    upstreamReachedShare: nUp / k
  };
}
