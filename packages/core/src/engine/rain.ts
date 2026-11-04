/**
 * Heavy rain at high tide (model audit Phase 2, M15): Panjim's recurring flood.
 *
 * Catchments. Every in-scope land cell drains to an outlet by a priority-flood over the DEM: the creeks and
 * Mala lake (drawn in from OpenStreetMap, since they are narrower than a grid cell) and, for central Panjim,
 * the Mandovi along the riverfront. Each cell takes the label of the outlet its lowest spill path reaches, and
 * its spill level (the highest ground on that path). Land that drains straight to other water is not modelled.
 *
 * Volume balance, per catchment, for one burst of rain centred on high tide:
 *   tide(t) = SLR + A·cos(2πt / 12.42 h), A = MHHW above MSL (semi-diurnal, M2 period)
 *   the outfall is closed while tide > outfall level: closedH = (12.42/π)·acos((outfall − SLR)/A)
 *   runoff   = rain (mm/h) × Σ cells C × cell area,  C = C_imp × built share + C_perv × (1 − built share)
 *   stored   = runoff over the burst − drains (while open) − pumps − retention
 * Where the stored water ponds (audit A4, Phase 3: rain lands where it falls). Each cell keeps its own share of the
 * stored volume (its share of the runoff) and passes it downhill along its spill path, fill-and-spill:
 *   - a local depression (cells whose spill level is above their ground) holds water up to its rim, and passes the
 *     rest on from its spill point;
 *   - water that reaches the outlet ponds in its own outlet sub-catchment: the outlet cells are grouped, in order
 *     along the creek line, into sub-catchments of at most about `subCatchmentKm2` of contributing land, and each
 *     ponds in its own lowest connected land, level h with Σ_{spill < h} (h − ground) × area = its volume.
 * Before Phase 3 the whole catchment's volume ponded at one level in its lowest land.
 * Without a flap gate on the outfall, tide water also backs up the drains to the high-tide level (MHHW + SLR)
 * over the catchment's land whose spill level is below it, and the rain ponds on top.
 */
import { MinHeap, neighbours, rasterizeLine, type DerivedArea } from "./grid";
import { applyDrainageEffect, type DrainageState, type WorkStep } from "./effects";
import type { Bound, Placement, SolutionDef } from "./types";

export const M2_PERIOD_H = 12.42;

export interface CatchmentDef {
  id: string;
  name: string;
  /** lon/lat box: flow-path water cells inside it are this catchment's outlets */
  outletWaterBox: [number, number, number, number] | null;
  outletLines: [number, number][][];
}

export interface Catchments {
  defs: CatchmentDef[];
  /** catchment index per cell (−1: not in a modelled catchment) */
  label: Int8Array;
  /** spill level per cell (m): the highest ground on its lowest path to the outlet */
  spill: Float32Array;
  /** cells of each catchment, sorted by spill level */
  cells: number[][];
  areaKm2: number[];
  /** 1 on the land cells of the modelled catchments */
  land: Uint8Array;
  /** the cell each cell spills into on its way to the outlet (−1 for outlet cells) */
  parent: Int32Array;
  /** land cells of each catchment, upstream first (each cell before the cell it spills into) */
  upstreamFirst: number[][];
  /** local depression per cell (−1: none) and the depressions: cells sorted by ground, rim (m), spill point */
  pit: Int32Array;
  pits: { catchment: number; cells: number[]; rimM: number; outlet: number }[];
  /** outlet sub-catchment per outlet cell (−1 elsewhere), and each sub-catchment's land cells sorted by spill level */
  subOfOutlet: Int32Array;
  subs: { catchment: number; cells: number[]; areaKm2: number }[];
}

/**
 * Priority-flood from the outlets over in-scope land (the lowest spill path decides the catchment), then the
 * local depressions and the outlet sub-catchments of at most about `subCatchmentKm2` (audit A4). Only depressions
 * whose rim is at or below `maxRimM` store water: above it the terrain model's hollows are artefacts (DeltaDTM ends
 * at 10 m, and its lower values meet the GLO-30 fallback in steps), so water runs on through them.
 */
export function deriveCatchments(area: DerivedArea, elevM: Float32Array, inScope: Uint8Array, defs: CatchmentDef[], subCatchmentKm2 = Infinity, maxRimM = Infinity): Catchments {
  const g = area.grid;
  const n = g.cols * g.rows;
  const label = new Int8Array(n).fill(-2); // −2 unvisited, −1 other outlet
  const spill = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  const z = (i: number) => (Number.isFinite(elevM[i]) ? elevM[i] : 0);
  const seeds: number[][] = defs.map(() => []);
  const seed = (i: number, k: number) => {
    if (label[i] !== -2) return;
    label[i] = k; spill[i] = z(i); heap.push(spill[i], i);
    if (k >= 0) seeds[k].push(i);
  };
  defs.forEach((d, k) => {
    for (const line of d.outletLines) for (const i of rasterizeLine(g, line)) if (inScope[i] || area.isFlowPath[i]) seed(i, k);
  });
  defs.forEach((d, k) => {
    if (!d.outletWaterBox) return;
    const [x0, x1, y0, y1] = d.outletWaterBox;
    // along the bank, west to east, so that neighbouring outlet cells fall in the same sub-catchment
    const box: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!area.isFlowPath[i]) continue;
      const lon = g.data.bbox.lon_min + ((i % g.cols) + 0.5) * g.data.cellDeg, lat = g.data.bbox.lat_max - (Math.floor(i / g.cols) + 0.5) * g.data.cellDeg;
      if (lon >= x0 && lon < x1 && lat >= y0 && lat < y1) box.push(i);
    }
    for (const i of box.sort((a, b) => (a % g.cols) - (b % g.cols) || a - b)) seed(i, k);
  });
  for (let i = 0; i < n; i++) if (area.isFlowPath[i]) seed(i, -1);
  const popped: number[] = [];
  while (heap.size > 0) {
    const [s, i] = heap.pop();
    if (s > spill[i]) continue;
    popped.push(i);
    for (const j of neighbours(g, i)) {
      if (label[j] !== -2 || area.isFlowPath[j] || !inScope[j]) continue;
      label[j] = label[i];
      spill[j] = Math.max(z(j), s);
      parent[j] = i;
      heap.push(spill[j], j);
    }
  }
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && inScope[i] && !area.isFlowPath[i]) land[i] = 1;
  const cells: number[][] = defs.map(() => []);
  for (let i = 0; i < n; i++) if (land[i]) cells[label[i]].push(i);
  for (const c of cells) c.sort((a, b) => spill[a] - spill[b]);
  const lab = Int8Array.from(label, (v) => (v < 0 ? -1 : v));
  const upstreamFirst: number[][] = defs.map(() => []);
  for (let q = popped.length - 1; q >= 0; q--) if (land[popped[q]]) upstreamFirst[label[popped[q]]].push(popped[q]);

  // local depressions: connected land of one catchment filled to the same spill level, above its ground
  const EPS = 1e-4;
  const inPit = (i: number) => land[i] === 1 && spill[i] > z(i) + EPS && spill[i] <= maxRimM;
  const rank = new Int32Array(n).fill(-1);
  popped.forEach((i, q) => (rank[i] = q));
  const pit = new Int32Array(n).fill(-1);
  const pits: Catchments["pits"] = [];
  for (let i = 0; i < n; i++) {
    if (pit[i] >= 0 || !inPit(i)) continue;
    const id = pits.length, members = [i];
    pit[i] = id;
    for (let q = 0; q < members.length; q++) {
      for (const j of neighbours(g, members[q])) {
        if (pit[j] >= 0 || !inPit(j) || label[j] !== label[i] || Math.abs(spill[j] - spill[i]) > EPS) continue;
        pit[j] = id;
        members.push(j);
      }
    }
    // spill point: the member settled first, whose spill path leaves the depression
    const outlet = members.reduce((a, b) => (rank[b] < rank[a] ? b : a));
    pits.push({ catchment: label[i], cells: members.sort((a, b) => z(a) - z(b)), rimM: spill[i], outlet });
  }

  // outlet sub-catchments: the land draining to each outlet cell, grouped in order along the outlet up to the size limit
  const root = new Int32Array(n).fill(-1);
  for (const i of popped) root[i] = parent[i] < 0 ? i : root[parent[i]];
  const contrib = new Float64Array(n);
  for (let i = 0; i < n; i++) if (land[i]) contrib[root[i]] += g.data.cellAreaKm2;
  const subOfOutlet = new Int32Array(n).fill(-1);
  const subs: Catchments["subs"] = [];
  seeds.forEach((list, k) => {
    let cur = -1;
    for (const o of list) {
      if (contrib[o] === 0) continue;
      if (cur < 0 || subs[cur].areaKm2 + contrib[o] > subCatchmentKm2) {
        cur = subs.length;
        subs.push({ catchment: k, cells: [], areaKm2: 0 });
      }
      subOfOutlet[o] = cur;
      subs[cur].areaKm2 += contrib[o];
    }
  });
  for (const c of cells) for (const i of c) subs[subOfOutlet[root[i]]].cells.push(i);
  return { defs, label: lab, spill, cells, areaKm2: cells.map((c) => c.length * g.data.cellAreaKm2), land, parent, upstreamFirst, pit, pits, subOfOutlet, subs };
}

export interface RainInputs {
  depthMm: number;
  burstH: number;
  outfallInvertM: number;
  /** MHHW above MSL: the tide's amplitude */
  mhhwM: number;
  slrM: number;
  cImp: number;
  cPerv: number;
  drainMmPerH: number;
}

/** Hours per tidal cycle that the tide stands above the outfall. */
export function closedHours(outfallM: number, slrM: number, ampM: number): number {
  const x = ampM > 0 ? (outfallM - slrM) / ampM : outfallM > slrM ? 1 : -1;
  if (x <= -1) return M2_PERIOD_H;
  if (x >= 1) return 0;
  return (M2_PERIOD_H / Math.PI) * Math.acos(x);
}

export interface CatchmentResult {
  id: string;
  name: string;
  areaKm2: number;
  /** Σ C × area (m²) */
  runoffAreaM2: number;
  closedH: number;
  runoffM3: number;
  drainedM3: number;
  pumpedM3: number;
  retainedM3: number;
  storedM3: number;
  backflow: boolean;
  /** highest ponding level among the catchment's outlet sub-catchments (m above MSL), −Infinity if nothing ponds */
  levelM: number;
  /** stored water held in local depressions on its way to the outlet (m³) */
  localM3: number;
  /** outlet sub-catchments, and how many of them pond rain */
  subCatchments: number;
  subCatchmentsPonding: number;
  steps: WorkStep[];
}

/** Which catchment a drainage placement serves: its instance param, or the catchment under its map point. */
export function catchmentOf(pl: Placement, c: Catchments, cellAt?: (lon: number, lat: number) => number): number {
  if (pl.geometry && cellAt) {
    const pts = pl.geometry.type === "Point" ? [pl.geometry.coordinates] : pl.geometry.coordinates;
    for (const [lon, lat] of pts) {
      const i = cellAt(lon, lat);
      if (i >= 0 && c.label[i] >= 0) return c.label[i];
    }
  }
  return Math.round(pl.params.catchment ?? 1);
}

/**
 * Ponding levels for the rain-at-high-tide event (−Infinity where dry) and the working per catchment.
 * `builtShare` is each cell's share of roofs and roads (0–1).
 */
export function rainLevels(
  c: Catchments,
  elevM: Float32Array,
  cellAreaM2: number,
  builtShare: Float32Array,
  inp: RainInputs,
  placements: Placement[],
  solutions: Record<string, SolutionDef>,
  bound: Bound,
  cellAt?: (lon: number, lat: number) => number
): { level: Float64Array; catchments: CatchmentResult[] } {
  const level = new Float64Array(elevM.length).fill(-Infinity);
  // fill-and-spill state, shared by the catchments (each touches only its own cells)
  const acc = new Float64Array(elevM.length);
  const local = new Float64Array(elevM.length).fill(-Infinity);
  const pitVol = new Float64Array(c.pits.length);
  const subVol = new Float64Array(c.subs.length);
  const closedH = Math.min(inp.burstH, closedHours(inp.outfallInvertM, inp.slrM, inp.mhhwM));
  const openH = inp.burstH - closedH;
  const rate = inp.depthMm / inp.burstH; // mm/h
  const highTide = inp.mhhwM + inp.slrM;
  const results = c.defs.map((d, k) => {
    const cells = c.cells[k];
    let aeff = 0;
    for (const i of cells) aeff += (inp.cImp * builtShare[i] + inp.cPerv * (1 - builtShare[i])) * cellAreaM2;
    const st: DrainageState = { retentionM3: 0, pumpM3s: 0, addedCapacityM3s: 0, gated: false };
    const steps: WorkStep[] = [];
    for (const pl of placements) {
      const sol = solutions[pl.solutionId];
      if (!sol) continue;
      for (const eff of sol.effects) {
        if (catchmentOf(pl, c, cellAt) !== k) continue;
        steps.push(...applyDrainageEffect(eff, sol, pl, st, bound));
      }
    }
    const runoff = (rate / 1000) * inp.burstH * aeff;
    const runoffOpen = (rate / 1000) * openH * aeff;
    const drainCap = ((inp.drainMmPerH / 1000) * cells.length * cellAreaM2) / 3600 + st.addedCapacityM3s;
    const drained = Math.min(runoffOpen, drainCap * 3600 * openH);
    const pumped = Math.min(runoff - drained, st.pumpM3s * 3600 * inp.burstH);
    const retained = Math.min(runoff - drained - pumped, st.retentionM3);
    const stored = Math.max(0, runoff - drained - pumped - retained);
    // fill-and-spill: each cell's share of the stored water runs downhill; depressions fill to their rim first
    const perCellM3 = (rate / 1000) * inp.burstH * cellAreaM2 * (runoff > 0 ? stored / runoff : 0);
    const pass = (i: number, v: number) => {
      const p = c.parent[i];
      if (p < 0) subVol[c.subOfOutlet[i]] += v; // an outlet cell on land
      else if (c.parent[p] < 0 && !c.land[p]) subVol[c.subOfOutlet[p]] += v; // reaches the creek or river
      else acc[p] += v;
    };
    for (const i of c.upstreamFirst[k]) {
      acc[i] += (inp.cImp * builtShare[i] + inp.cPerv * (1 - builtShare[i])) * perCellM3;
      const r = c.pit[i];
      if (r < 0) {
        if (acc[i] > 0) pass(i, acc[i]);
        acc[i] = 0;
        continue;
      }
      pitVol[r] += acc[i];
      acc[i] = 0;
      if (i !== c.pits[r].outlet) continue;
      const pt = c.pits[r];
      const cap = pt.cells.reduce((a, j) => a + (pt.rimM - elevM[j]), 0) * cellAreaM2;
      const over = Math.max(0, pitVol[r] - cap);
      pitVol[r] -= over;
      if (over > 0) pass(i, over);
    }
    // the water each depression holds, at one level over its lowest cells
    let localM3 = 0;
    c.pits.forEach((pt, r) => {
      if (pt.catchment !== k || !(pitVol[r] > 0)) return;
      localM3 += pitVol[r];
      const v = pitVol[r] / cellAreaM2;
      let m = 0, sum = 0;
      for (const j of pt.cells) {
        if (m > 0 && m * elevM[j] - sum >= v) break;
        m++; sum += elevM[j];
      }
      const hp = Math.min(pt.rimM, (v + sum) / m);
      for (let q = 0; q < m; q++) if (hp > elevM[pt.cells[q]]) local[pt.cells[q]] = hp;
    });
    // the rest ponds in each outlet sub-catchment's lowest connected land: sweep its cells by spill level
    const backflow = !st.gated;
    const B = backflow ? highTide : -Infinity;
    const base = (i: number) => (backflow && c.spill[i] < B ? B : Math.max(elevM[i], local[i]));
    let h = -Infinity, nSubs = 0, nPonding = 0;
    c.subs.forEach((sub, q) => {
      if (sub.catchment !== k) return;
      nSubs++;
      const vol = subVol[q] / cellAreaM2; // m of water × cells
      let nIn = 0, sumBase = 0;
      for (const i of sub.cells) {
        // cells below the high-tide level are filled by backflow before any rain is counted
        if (backflow && c.spill[i] < B) { nIn++; sumBase += base(i); continue; }
        if (nIn > 0 && nIn * c.spill[i] - sumBase >= vol) break;
        nIn++; sumBase += base(i);
      }
      if (nIn === 0 || !(vol > 0 || backflow)) return;
      const hs = backflow ? Math.max(B, (vol + sumBase) / nIn) : (vol + sumBase) / nIn;
      for (let m = 0; m < nIn; m++) {
        const i = sub.cells[m];
        if (hs > elevM[i]) level[i] = Math.max(level[i], hs);
      }
      if (vol > 0) nPonding++;
      h = Math.max(h, hs);
    });
    for (const i of cells) if (local[i] > elevM[i]) level[i] = Math.max(level[i], local[i]);
    steps.unshift(
      { label: "Catchment area", formula: `${cells.length} cells, drains to ${d.name.split(" (")[0]}`, value: cells.length * cellAreaM2 / 1e6, unit: "km²" },
      { label: "Runoff area", formula: `Σ (${inp.cImp} × built share + ${inp.cPerv} × unbuilt) × cell area`, value: aeff / 1e6, unit: "km²" },
      { label: "Rain in the burst", formula: `${inp.depthMm.toFixed(0)} mm in ${inp.burstH} h, centred on high tide`, value: inp.depthMm, unit: "mm" },
      { label: "Outfall closed", formula: `tide above the outfall (${inp.outfallInvertM} m) for ${closedHours(inp.outfallInvertM, inp.slrM, inp.mhhwM).toFixed(1)} h of each ${M2_PERIOD_H} h cycle (amplitude ${inp.mhhwM} m${inp.slrM ? `, SLR ${inp.slrM.toFixed(2)} m` : ""})`, value: closedH, unit: "h" },
      { label: "Runoff", formula: "rain × runoff area", value: runoff, unit: "m³" },
      { label: "Drained while the outfall is open", formula: `${inp.drainMmPerH} mm/h over the catchment${st.addedCapacityM3s ? ` + ${st.addedCapacityM3s.toFixed(1)} m³/s added` : ""} for ${openH.toFixed(1)} h`, value: -drained, unit: "m³" }
    );
    if (pumped) steps.push({ label: "Pumped", formula: `${st.pumpM3s.toFixed(1)} m³/s for ${inp.burstH} h, at most the runoff left`, value: -pumped, unit: "m³" });
    if (retained) steps.push({ label: "Held in retention", formula: `${Math.round(st.retentionM3).toLocaleString()} m³ available`, value: -retained, unit: "m³" });
    steps.push({ label: "Stored on land", formula: "runoff − drained − pumped − retained", value: stored, unit: "m³" });
    steps.push({ label: "Held in local hollows on the way down", formula: `${c.pits.filter((p) => p.catchment === k).length} hollows in the terrain fill to their rim, then spill on`, value: localM3, unit: "m³" });
    steps.push({ label: backflow ? "Highest ponding level near the creek (tide backs up the drains: no flap gate)" : "Highest ponding level near the creek (outfalls gated)", formula: `${nPonding} of ${nSubs} outlet sub-catchments pond; ${backflow ? `rain ponds on top of the high-tide level ${highTide.toFixed(2)} m in the drains` : "rain fills each one's lowest connected land"}`, value: h, unit: "m" });
    return { id: d.id, name: d.name, areaKm2: c.areaKm2[k], runoffAreaM2: aeff, closedH, runoffM3: runoff, drainedM3: drained, pumpedM3: pumped, retainedM3: retained, storedM3: stored, backflow, levelM: h, localM3, subCatchments: nSubs, subCatchmentsPonding: nPonding, steps } satisfies CatchmentResult;
  });
  return { level, catchments: results };
}
