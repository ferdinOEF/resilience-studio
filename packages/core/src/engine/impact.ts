/**
 * Impact and risk (model audit Phase 2, M12/M13): the metric chain after the hazard.
 *
 *   Impact   damage (₹) = Σ cells Σ classes exposure × maximum damage × factor(depth)   (Huizinga et al. 2017, Asia)
 *            people affected = Σ cells people × 1[depth > threshold]                  (GHS-POP 2020; 0.15 m by default)
 *   Risk     expected annual damage EAD = Σ_k ½ (D_k + D_k+1)(p_k − p_k+1), p = 1/RP over RP 1, 10, 50, 100
 *            (and the same for people affected per year)
 *   Equity   damage and people affected grouped by the social vulnerability (SVI) class of the census unit
 *
 * Vulnerability is no longer V = (H/H0)·S: the physical part is the depth-damage curve of each asset class,
 * and the social part is the SVI class, kept separate (IPCC AR5/AR6: sensitivity and adaptive capacity).
 */
import type { ExtentResult } from "./inundation";
import type { Bound, Param } from "./types";

export const ASSET_CLASSES = ["residential", "commercial", "industrial", "roads", "agriculture"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const SVI_CLASSES = ["lower", "middle", "higher"] as const;
export type SviClass = (typeof SVI_CLASSES)[number];

/** Exposure per grid cell, aligned with the CRZ grid. */
export interface ExposureGrids {
  /** people per cell */
  pop: Float32Array;
  /** building footprint m² per cell, by class; road surface m² per cell */
  m2: Record<"residential" | "commercial" | "industrial" | "roads", Float32Array>;
  /** farmland ha per cell */
  agriHa: Float32Array;
  /** building count per cell */
  buildings: Float32Array;
  /** SVI class index per cell (0 lower, 1 middle, 2 higher), −1 where the cell's census unit has no index */
  svi: Int8Array;
}

export interface DamageModel {
  curves: Record<AssetClass, { depthM: number[]; factor: number[] }>;
  /** ₹ per m² (per ha for agriculture) */
  maxDamage: Record<AssetClass, Param>;
}

/** Damage factor (share of the maximum) at a depth, linear between the curve's points. */
export function damageFactor(c: { depthM: number[]; factor: number[] }, d: number): number {
  if (!(d > 0)) return 0;
  const x = c.depthM, y = c.factor;
  if (d >= x[x.length - 1]) return y[y.length - 1];
  let k = 1;
  while (x[k] < d) k++;
  return y[k - 1] + ((y[k] - y[k - 1]) * (d - x[k - 1])) / (x[k] - x[k - 1]);
}

/** Maximum damage at a bound: the "low" (least favourable) bound takes the top of the range. */
export function maxDamageAt(p: Param, bound: Bound): number {
  if (bound === "central" || p.low === undefined || p.high === undefined) return p.value;
  return bound === "low" ? p.high : p.low;
}

export interface ImpactGroup { damageInr: number; peopleAffected: number }
export interface Impact extends ImpactGroup {
  byClass: Record<AssetClass, number>;
  /** people living in flooded cells, any depth */
  peopleInFlood: number;
  /** buildings whose cell is flooded */
  buildingsWet: number;
  /** by SVI class (lower, middle, higher), then "not classified" */
  bySvi: Record<SviClass | "none", ImpactGroup>;
  /** by segment id ("" = outside every segment's hinterland) */
  bySegment: Record<string, ImpactGroup>;
}

/**
 * Impact of one event: every newly flooded or behind-bund cell (land already wet at every high tide carries
 * no new damage). `segmentOf` maps a cell to its segment id (or "").
 */
export function impactOf(
  ext: ExtentResult,
  x: ExposureGrids,
  dm: DamageModel,
  bound: Bound,
  peopleDepthM: number,
  segmentOf: (i: number) => string
): Impact {
  const zero = (): ImpactGroup => ({ damageInr: 0, peopleAffected: 0 });
  const out: Impact = {
    ...zero(), peopleInFlood: 0, buildingsWet: 0,
    byClass: Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>,
    bySvi: { lower: zero(), middle: zero(), higher: zero(), none: zero() },
    bySegment: {}
  };
  const md = Object.fromEntries(ASSET_CLASSES.map((c) => [c, maxDamageAt(dm.maxDamage[c], bound)])) as Record<AssetClass, number>;
  for (const cells of [ext.floodedCells, ext.bundedCells]) {
    for (const i of cells) {
      const d = ext.depth[i];
      let dmg = 0;
      for (const c of ASSET_CLASSES) {
        const e = c === "agriculture" ? x.agriHa[i] : x.m2[c][i];
        if (!e) continue;
        const v = e * md[c] * damageFactor(dm.curves[c], d);
        out.byClass[c] += v;
        dmg += v;
      }
      const ppl = d > peopleDepthM ? x.pop[i] : 0;
      out.damageInr += dmg;
      out.peopleAffected += ppl;
      out.peopleInFlood += x.pop[i];
      out.buildingsWet += x.buildings[i];
      const g = out.bySvi[x.svi[i] >= 0 ? SVI_CLASSES[x.svi[i]] : "none"];
      g.damageInr += dmg; g.peopleAffected += ppl;
      const sid = segmentOf(i);
      const sg = (out.bySegment[sid] ??= zero());
      sg.damageInr += dmg; sg.peopleAffected += ppl;
    }
  }
  return out;
}

/**
 * Expected annual value from event values at return periods (trapezoid over the annual exceedance
 * probability p = 1/RP, from the most frequent to the rarest event computed). Events rarer than the
 * rarest return period are left out, so the result is a lower bound on the full integral.
 */
export function expectedAnnual(points: { rp: number; value: number }[]): number {
  const s = [...points].sort((a, b) => a.rp - b.rp);
  let sum = 0;
  for (let k = 0; k + 1 < s.length; k++) {
    const p0 = 1 / s[k].rp, p1 = 1 / s[k + 1].rp;
    sum += 0.5 * (s[k].value + s[k + 1].value) * (p0 - p1);
  }
  return sum;
}
