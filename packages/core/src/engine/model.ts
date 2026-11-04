/**
 * One water level in metres for every hazard (model audit Phase 1, M11), per segment and on the map.
 *
 *   WL = MHHW + SLR + storm surge(RP) + river stage(x, RP) − mangrove (cm/km × width) − storage
 *
 * where storm surge = storm tide(RP) − MHHW (the storm tide already contains the tide). The level spreads
 * over connected land (inundation.ts); barriers block it up to their crest; depth = WL − ground.
 * The per-segment results and the map come from the same fill, so the tables and the map agree.
 *
 * Per segment, measures are applied in three passes, in physical order:
 *   1. fluvial   storage draws down the river volume (khazan, check dam)
 *   2. seaward   mangroves lower the surge; breakwaters and vegetation cut the open-coast wave indicator
 *   3. barrier   shoreline structures meet the water level at the shoreline (seawall, dune), with their failure tests
 *
 * Exposure inside the flooded land (newly flooded + khazan behind bunds) is the result. Waves are an
 * open-coast indicator, reported on their own and not added to the water level.
 *
 * Phase 2 adds the rest of the metric chain (audit M12-M16): damage in ₹ and people affected per event
 * (impact.ts), expected annual damage and people affected per year over the return periods (runRisk),
 * the rain-at-high-tide hazard (rain.ts), and an ecology card kept apart from damage (ecology.ts).
 */
import { applyEffect, STAGE_OF, type HazardState, type WorkStep } from "./effects";
import { isBunded, segmentHazardFromDistance, type DerivedArea } from "./grid";
import { expectedAnnual, impactOf, SVI_CLASSES, type DamageModel, type ExposureGrids, type Impact, type SviClass } from "./impact";
import { barrierCrests, classifyExtent, fillLevels, summarizeExtent, waterSource, type ExtentResult, type ExtentSummary, type ShoreCut } from "./inundation";
import { mangroveSqueeze, type SqueezeResult } from "./ecology";
import { rainLevels, type CatchmentResult, type Catchments } from "./rain";
import type { Bound, Exposure, Placement, ReturnPeriod, ScenarioId, SegmentDef, SegmentStats, SolutionDef } from "./types";

export type HazardValues = {
  /** normal high tide, MHHW (m above MSL) */
  highTideReferenceM: number;
  /** spring high water (m above MSL): land below it that stays dry today has defences the data lacks (audit A1) */
  springHighWaterM: number;
  /** crest assumed for those unmapped defences: the 1-year storm tide, so they hold at RP 1 (m above MSL) */
  defendedCrestM: number;
  /** storm tide (tide + surge) at the chosen return period (m above MSL) */
  stormTideM: number;
  /** river stage above the tide at the upstream edge, at the chosen return period (m) */
  riverStageM: number;
  lambdaWavePerKm: number;
  lambdaFluvialPerKm: number;
  overlandAttenuationMPerKm: number;
  bundCrestM: number;
  /** rain at high tide (audit M15): 1-day rainfall at the return period (mm) and the volume-balance inputs */
  rainDepthMm: number;
  rainBurstHours: number;
  outfallInvertM: number;
  runoffCoefImpervious: number;
  runoffCoefPervious: number;
  drainCapacityMmPerH: number;
  /** depth above which a person in a flooded cell counts as affected (m) */
  peopleAffectedDepthM: number;
};

export interface ModelContext {
  area: DerivedArea;
  segDefs: SegmentDef[];
  solutions: Record<string, SolutionDef>;
  /** ground level per cell (m above MSL, EGM2008) */
  elevM: Float32Array;
  /** land cells inside the study scope */
  inScope: Uint8Array;
  /** segment index per shore and hinterland cell (−1 outside) */
  cellSegment: Int16Array;
  excludeKhazan: Record<string, boolean>;
  /** central hazard inputs (at the chosen return period) */
  hazard: HazardValues;
  /**
   * Hazard inputs at each bound (audit M4). "low" = most hazardous end of every hazard range,
   * "high" = least hazardous, matching the solution bounds' naming (low = least protective).
   */
  hazardAt?: Partial<Record<Bound, HazardValues>>;
  /** exposure per cell (people, buildings, roads, farmland, SVI class): Phase 2 impact */
  grids?: ExposureGrids;
  damage?: DamageModel;
  /** creek catchments for rain at high tide, and each cell's built share (roofs + roads, 0–1) */
  catchments?: Catchments;
  builtShare?: Float32Array;
  /** grid cell at a lon/lat (−1 outside), for map-placed drainage measures */
  cellAt?: (lon: number, lat: number) => number;
}

/** Sea-level rise (m) for the event: central, and the likely range's ends. */
export interface SlrInput { central: number; lowRise: number; highRise: number }

export interface EventOptions {
  slr: SlrInput;
  /** khazan bunds fail: water enters khazan land freely (audit M9 scenario toggle) */
  bundsFailed?: boolean;
}

/**
 * Siting rule (audit M3): can this solution work on this segment's frontage?
 * "khazan" in a solution's allowed settings matches any segment with khazan present.
 */
export function isAllowed(sol: SolutionDef, seg: Pick<SegmentDef, "setting" | "khazanPresent">): boolean {
  return sol.allowedSettings.includes(seg.setting) || (seg.khazanPresent && sol.allowedSettings.includes("khazan"));
}

/**
 * Exposure classes counted inside the flooded land. Mangrove and khazan are not among them since Phase 2
 * (audit M14): tidal flooding is a mangrove's habitat, and khazan is reported as bund overtopping / failure.
 */
export const EXPOSURE_CATEGORIES = [
  { key: "urbanKm2", label: "CRZ-II urban land", unit: "km²" },
  { key: "ruralCrzKm2", label: "CRZ-III land", unit: "km²" },
  { key: "population", label: "People", unit: "people" },
  { key: "buildings", label: "Buildings", unit: "buildings" }
] as const;
export type ExposureKey = (typeof EXPOSURE_CATEGORIES)[number]["key"];

/** Exposure in a segment's hinterland band (in-scope cells): land classes, and people and buildings from the grids. */
export function defaultExposure(seg: SegmentStats, grids?: ExposureGrids, inScope?: Uint8Array): Exposure {
  const a = seg.classAreaKm2;
  let pop = 0, bld = 0;
  if (grids) for (const i of seg.bandCells) if (!inScope || inScope[i]) { pop += grids.pop[i]; bld += grids.buildings[i]; }
  return {
    urbanKm2: a.U ?? 0,
    ruralCrzKm2: (a.N ?? 0) + (a.T ?? 0),
    population: grids ? Math.round(pop) : null,
    buildings: Math.round(bld)
  };
}

/**
 * Existing measures the data supports: fringing mangrove, and khazan bund-and-sluice storage; plus any
 * existing measures listed in the case-study file (e.g. Mala's pumping station, retention and gates).
 */
export function deriveBaseline(area: DerivedArea, listed: Placement[] = []): Placement[] {
  const out: Placement[] = [...listed];
  const minBelt = area.grid.cellEdgeKm * 1000 * 0.5;
  for (const seg of area.segments) {
    if (seg.mangroveBeltM >= minBelt) {
      out.push({
        id: `existing-mangrove-${seg.id}`,
        solutionId: "mangrove",
        segmentId: seg.id,
        params: { widthM: Math.round(seg.mangroveBeltM), maturity: 1 },
        existing: true,
        derivedNote: "Width = CRZ-IA mangrove area within 0.5 km of the shoreline ÷ shoreline length, from the CRZ grid (reasoned_extrapolation). Maturity 1.0 is assumed for existing stands."
      });
    }
    if (seg.khazanKm2 > 0) {
      out.push({
        id: `existing-khazan-${seg.id}`,
        solutionId: "tidal_wetland_polder",
        segmentId: seg.id,
        params: { areaHa: Math.round(seg.khazanKm2 * 100), condition: 1 },
        existing: true,
        derivedNote: "Area = khazan-land estimate in this segment's hinterland (placeholder_needs_calibration, per the case-study file). Treated as current bund-and-sluice infrastructure per the pre-1991 policy note. Condition 1.0 is a placeholder: no condition survey exists."
      });
    }
  }
  return out;
}

export interface SegmentResult {
  segmentId: string;
  water: {
    /** MHHW + SLR (m) */
    baseM: number;
    slrM: number;
    /** storm surge above MHHW at the shoreline, before and after mangroves (m) */
    stormM0: number;
    stormM: number;
    /** river stage at the shoreline, before and after storage (m) */
    riverM0: number;
    riverM: number;
  };
  /** still-water level at the shoreline after mangroves and storage, before barriers (m above MSL) */
  shorelineWlM: number;
  /** open-coast wave indicator: share of open-sea wave energy reaching the frontage, before and after measures */
  wave: { openCoast: boolean; W0: number; W: number };
  /** this segment's part of the map extent (km²) */
  extent: { floodedKm2: number; bundedKm2: number; wetTideKm2: number; defendedKm2: number; bandKm2: number };
  exposure: Exposure;
  /** exposure inside the flooded land (newly flooded + behind bunds), in the category's unit */
  risk: Record<ExposureKey, number | null>;
  /** damage (₹) and people affected in this segment's hinterland, when the exposure grids are loaded */
  impact: { damageInr: number; peopleAffected: number } | null;
  steps: WorkStep[];
  flags: WorkStep[];
}

const OPEN_COAST = new Set(["sandy_open_coast", "rocky_coast"]);
/** classes that spring tides flood as habitat (mangrove, ponds), not land that needs a defence */
const TIDAL_HABITAT = new Set(["M", "W"]);
export interface TideToday {
  /** the land wet today: below MHHW and connected, plus mangrove and ponds below spring high water */
  level: Float64Array;
  /** other land the spring tide would reach, between MHHW and spring high water, outside the bunds: it has unmapped defences */
  defended: Uint8Array;
}
const tideCache = new WeakMap<ModelContext, Map<string, TideToday>>();

/**
 * Today's tide spread over the land (central MHHW and spring high water, no SLR, bunds intact): the "wet at every
 * high tide" class, and the low land that only unmapped defences can be keeping dry (audit A1).
 */
export function tideToday(ctx: ModelContext): TideToday {
  const hz = ctx.hazard;
  const key = `${hz.highTideReferenceM}|${hz.springHighWaterM}|${hz.bundCrestM}`;
  let m = tideCache.get(ctx);
  if (!m) tideCache.set(ctx, (m = new Map()));
  let t = m.get(key);
  if (!t) {
    const fill = (refM: number) => fillLevels(ctx.area, ctx.elevM, ctx.inScope, waterSource(ctx.area, "slr", { ...hz, highTideReferenceM: refM }, 0), {
      cellSegment: ctx.cellSegment, bundCrestM: hz.bundCrestM, overlandMPerKm: 0
    });
    const level = fill(hz.highTideReferenceM);
    const spring = fill(hz.springHighWaterM);
    const defended = new Uint8Array(level.length);
    const g = ctx.area.grid;
    for (let i = 0; i < level.length; i++) {
      if (!ctx.inScope[i] || !(spring[i] > ctx.elevM[i]) || level[i] > ctx.elevM[i] || isBunded(g, i)) continue;
      // creek gaps the water flows through, mangrove and ponds: spring tides reach them as tidal water or habitat
      if (ctx.area.isFlowPath[i] || TIDAL_HABITAT.has(g.cls[i])) level[i] = spring[i];
      else defended[i] = 1;
    }
    m.set(key, (t = { level, defended }));
  }
  return t;
}

export interface EventResult {
  segments: SegmentResult[];
  ext: ExtentResult;
  sum: ExtentSummary;
  /** damage, people affected, buildings wet over the whole scope (null without exposure grids) */
  impact: Impact | null;
  /** rain at high tide: the volume balance per creek catchment */
  rain: CatchmentResult[] | null;
}

/** One event (hazard inputs, SLR and measures fixed) at one bound of the solution ranges. */
export function runEvent(
  ctx: ModelContext,
  scenario: ScenarioId,
  placements: Placement[],
  bound: Bound,
  hz: HazardValues,
  slrM: number,
  exposures: Record<string, Exposure>,
  bundsFailed = false
): EventResult {
  const src = waterSource(ctx.area, scenario, hz, slrM);
  const storms = scenario === "surge" || scenario === "compound";
  const rivers = scenario === "flood" || scenario === "compound";

  // ---- per segment: water at the shoreline and the measures' effect on it
  const pre = ctx.area.segments.map((seg) => {
    const segDef = ctx.segDefs.find((d) => d.id === seg.id)!;
    const incoming = segmentHazardFromDistance(ctx.area, seg, hz.lambdaWavePerKm, 0, hz.lambdaFluvialPerKm);
    const riverM0 = rivers ? hz.riverStageM * incoming.fluvial : 0;
    const s: HazardState = {
      wave: storms ? incoming.wave : 0,
      stormM: src.stormM,
      riverM: riverM0,
      floodVolumeM3: riverM0 * seg.lowLyingKm2 * 1e6,
      scenario,
      wlM: src.baseM,
      setting: segDef?.setting,
      hasMangrove: placements.some((p) => p.segmentId === seg.id && p.solutionId === "mangrove")
    };
    const W0 = s.wave;
    const steps: WorkStep[] = [];
    steps.push({ label: "Normal high tide (MHHW)", formula: "Mormugao chart datum levels, MHHW above MSL", value: hz.highTideReferenceM });
    if (slrM) steps.push({ label: "Sea-level rise", formula: "AR6, Mormugao (PSMSL 1249)", value: slrM });
    if (storms) steps.push({ label: "Storm surge above high tide", formula: `storm tide ${hz.stormTideM.toFixed(2)} m (tide + surge) − MHHW ${hz.highTideReferenceM} m`, value: s.stormM });
    if (rivers) {
      steps.push({ label: "River stage at the shoreline", formula: `${hz.riverStageM} m × mean exp(−${hz.lambdaFluvialPerKm}·d_upstream); ${Math.round(incoming.upstreamReachedShare * 100)}% of shoreline reached`, value: riverM0 });
      steps.push({ label: "River volume on low-lying land", formula: `stage × ${seg.lowLyingKm2.toFixed(3)} km²`, value: s.floodVolumeM3, unit: "m³" });
    }

    // Siting rules (audit M3): a measure the user put where it cannot work is ignored and flagged.
    // Existing measures come from the data and are always kept.
    const onSeg = placements.filter((p) => {
      if (p.segmentId !== seg.id) return false;
      const sol = ctx.solutions[p.solutionId];
      if (!sol || p.existing || !segDef || isAllowed(sol, segDef)) return true;
      steps.push({ label: `${sol.name}: NOT SITED, cannot work on a ${segDef.setting.replace(/_/g, " ")} frontage`, formula: `allowed on: ${sol.allowedSettings.join(", ").replace(/_/g, " ")}`, value: 0, unit: "", placementId: p.id, flag: "not_allowed" });
      return false;
    });
    const runStage = (stage: "fluvial" | "seaward" | "barrier") => {
      for (const pl of onSeg) {
        const sol = ctx.solutions[pl.solutionId];
        if (!sol) continue;
        for (const eff of sol.effects) {
          if (STAGE_OF[eff.kind] === stage) steps.push(...applyEffect(eff, sol, pl, s, bound));
        }
      }
    };
    runStage("fluvial");
    runStage("seaward");
    s.wlM = src.baseM + s.stormM + s.riverM;
    steps.push({
      label: "Water level at the shoreline",
      formula: `MHHW ${hz.highTideReferenceM}${slrM ? ` + SLR ${slrM.toFixed(2)}` : ""}${storms ? ` + surge ${s.stormM.toFixed(2)}` : ""}${rivers ? ` + river ${s.riverM.toFixed(2)}` : ""} (m above MSL)`,
      value: s.wlM
    });
    const wlM = s.wlM;
    runStage("barrier");
    const cut: ShoreCut = { stormCutM: src.stormM - s.stormM, riverKeep: riverM0 > 0 ? s.riverM / riverM0 : 1 };
    const openCoast = OPEN_COAST.has(segDef?.setting ?? "");
    // the wave indicator is reported for open-coast frontages only; elsewhere its steps are noise
    if (!openCoast) for (let k = steps.length - 1; k >= 0; k--) if (steps[k].unit === "share") steps.splice(k, 1);
    if (storms && openCoast) steps.push({ label: "Open-coast wave indicator (not in the water level)", formula: `exp(−${hz.lambdaWavePerKm}·d_sea) ${W0.toFixed(3)} → after measures`, value: s.wave, unit: "share" });
    return { seg, steps, cut, wlM, s, W0, openCoast, riverM0 };
  });

  // ---- the map: one fill for the whole area
  const crest = scenario === "slr" ? undefined : barrierCrests(ctx.area, placements, ctx.solutions, ctx.segDefs, bound, isAllowed);
  const tide = tideToday(ctx);
  const level = fillLevels(ctx.area, ctx.elevM, ctx.inScope, src, {
    cellSegment: ctx.cellSegment, cuts: pre.map((p) => p.cut), crest,
    bundCrestM: bundsFailed ? null : hz.bundCrestM, overlandMPerKm: storms ? hz.overlandAttenuationMPerKm : 0,
    defended: bundsFailed ? undefined : { mask: tide.defended, crestM: hz.defendedCrestM }
  });
  // rain at high tide: the stored runoff ponds in each creek catchment's lowest connected land
  let rain: CatchmentResult[] | null = null;
  if (scenario === "rain" && ctx.catchments && ctx.builtShare) {
    const r = rainLevels(ctx.catchments, ctx.elevM, ctx.area.grid.data.cellAreaKm2 * 1e6, ctx.builtShare, {
      depthMm: hz.rainDepthMm, burstH: hz.rainBurstHours, outfallInvertM: hz.outfallInvertM, mhhwM: hz.highTideReferenceM, slrM,
      cImp: hz.runoffCoefImpervious, cPerv: hz.runoffCoefPervious, drainMmPerH: hz.drainCapacityMmPerH
    }, placements, ctx.solutions, bound, ctx.cellAt);
    for (let i = 0; i < level.length; i++) if (r.level[i] > level[i]) level[i] = r.level[i];
    rain = r.catchments;
  }
  // Where the drains have no flap gate, today's normal high tide already backs up them: that land is
  // wet at every high tide (like land the sea reaches), so only the event's extra ponding is new.
  let tideRef = tide.level;
  if (rain && ctx.catchments && ctx.builtShare) {
    const c = ctx.hazard;
    const today = rainLevels(ctx.catchments, ctx.elevM, 1, ctx.builtShare, {
      depthMm: 0, burstH: 1, outfallInvertM: c.outfallInvertM, mhhwM: c.highTideReferenceM, slrM: 0, cImp: 0, cPerv: 0, drainMmPerH: 0
    }, placements, ctx.solutions, "central", ctx.cellAt).level;
    tideRef = Float64Array.from(tideRef, (v, i) => Math.max(v, today[i]));
  }
  const ext = classifyExtent(ctx.area, ctx.elevM, ctx.inScope, level, tideRef, tide.defended);
  const segExp = (s: SegmentStats) => exposures[s.id] ?? defaultExposure(s, ctx.grids, ctx.inScope);
  // a population the user entered scales the gridded people in that segment; blank = not computed
  const popScale = Object.fromEntries(ctx.area.segments.map((s) => {
    const user = segExp(s).population;
    const grid = defaultExposure(s, ctx.grids, ctx.inScope).population;
    return [s.id, user === null ? null : grid ? user / grid : null];
  }));
  const sum = summarizeExtent(ctx.area, ext, ctx.cellSegment, popScale, ctx.excludeKhazan, ctx.grids);
  const segIds = ctx.area.segments.map((s) => s.id);
  const impact = ctx.grids && ctx.damage
    ? impactOf(ext, ctx.grids, ctx.damage, bound, hz.peopleAffectedDepthM, (i) => (ctx.cellSegment[i] >= 0 ? segIds[ctx.cellSegment[i]] : ""))
    : null;

  const segments = pre.map(({ seg, steps, wlM, s, W0, openCoast, riverM0 }) => {
    const e = sum.bySegment[seg.id];
    const exposure = segExp(seg);
    const grid = defaultExposure(seg, ctx.grids, ctx.inScope);
    steps.push({ label: "Newly flooded land (map)", formula: "dry at today's high tide, below the water level carried to it, connected to the water", value: e.floodedKm2, unit: "km²" });
    if (e.bundedKm2 > 0) steps.push({ label: `Khazan and bunded fields flooded${bundsFailed ? " (bunds failed)" : ""}`, formula: bundsFailed ? "bund-failure scenario: water enters khazan land freely" : `water above the bund crest ${hz.bundCrestM} m`, value: e.bundedKm2, unit: "km²" });
    steps.push({ label: "Wet at every high tide today (not counted)", formula: `below MHHW ${ctx.hazard.highTideReferenceM} m, connected; mangrove and ponds below spring high water ${ctx.hazard.springHighWaterM} m`, value: e.wetTideKm2, unit: "km²" });
    if (e.defendedKm2 > 0) steps.push({ label: "Low land kept dry by defences the data doesn't have (not counted)", formula: `ground between MHHW ${ctx.hazard.highTideReferenceM} m and spring high water ${ctx.hazard.springHighWaterM} m, outside the bunds; held up to the 1-year storm tide ${hz.defendedCrestM.toFixed(2)} m`, value: e.defendedKm2, unit: "km²" });
    // Exposure inside the flood: the flooded share of each class, applied to the segment's exposure value
    // (equal to the flooded km² unless the user edited the exposure).
    const risk = {} as Record<ExposureKey, number | null>;
    for (const c of EXPOSURE_CATEGORIES) {
      const v = exposure[c.key];
      if (v === null) { risk[c.key] = null; continue; }
      if (c.key === "population") { risk[c.key] = e.population; continue; }
      if (c.key === "buildings") { risk[c.key] = e.buildings; continue; }
      const g = grid[c.key] as number;
      risk[c.key] = g > 0 ? v * Math.min(1, e[c.key] / g) : 0;
    }
    return {
      segmentId: seg.id,
      water: { baseM: src.baseM, slrM, stormM0: src.stormM, stormM: s.stormM, riverM0, riverM: s.riverM },
      shorelineWlM: wlM,
      wave: { openCoast, W0, W: s.wave },
      extent: { floodedKm2: e.floodedKm2, bundedKm2: e.bundedKm2, wetTideKm2: e.wetTideKm2, defendedKm2: e.defendedKm2, bandKm2: e.bandKm2 },
      exposure, risk, steps,
      impact: impact ? (impact.bySegment[seg.id] ?? { damageInr: 0, peopleAffected: 0 }) : null,
      flags: steps.filter((st) => st.flag)
    };
  });
  return { segments, ext, sum, impact, rain };
}

export interface Ranged { low: number; central: number; high: number }

export interface ScenarioRun {
  segments: { central: SegmentResult; low: SegmentResult; high: SegmentResult }[];
  totals: Record<ExposureKey, Ranged | null>;
  extents: Record<Bound, { ext: ExtentResult; sum: ExtentSummary }>;
  impacts: Record<Bound, Impact | null>;
  rain: Record<Bound, CatchmentResult[] | null>;
}

/** SLR (m) at a bound: the "low" (least favourable) bound takes the top of the likely range. */
export function slrAt(slr: SlrInput, bound: Bound): number {
  return bound === "low" ? slr.highRise : bound === "high" ? slr.lowRise : slr.central;
}

/**
 * Run the event at the central value and at the least- and most-favourable ends of every range
 * (hazard inputs, sea-level rise and solution parameters together). Note the naming: the "low" bound
 * is the least protective, so it gives the MOST flooding.
 */
export function runScenario(
  ctx: ModelContext,
  scenario: ScenarioId,
  placements: Placement[],
  exposures: Record<string, Exposure>,
  opts: EventOptions = { slr: { central: 0, lowRise: 0, highRise: 0 } }
): ScenarioRun {
  const ev = {} as Record<Bound, EventResult>;
  for (const b of ["low", "central", "high"] as const) {
    ev[b] = runEvent(ctx, scenario, placements, b, ctx.hazardAt?.[b] ?? ctx.hazard, slrAt(opts.slr, b), exposures, !!opts.bundsFailed);
  }
  const segments = ctx.area.segments.map((_, i) => ({ central: ev.central.segments[i], low: ev.low.segments[i], high: ev.high.segments[i] }));
  return {
    segments,
    totals: totalsOf(segments),
    extents: { low: { ext: ev.low.ext, sum: ev.low.sum }, central: { ext: ev.central.ext, sum: ev.central.sum }, high: { ext: ev.high.ext, sum: ev.high.sum } },
    impacts: { low: ev.low.impact, central: ev.central.impact, high: ev.high.impact },
    rain: { low: ev.low.rain, central: ev.central.rain, high: ev.high.rain }
  };
}

type SviKey = SviClass | "none";
const SVI_KEYS: SviKey[] = [...SVI_CLASSES, "none"];

/** Expected annual damage and people affected per year (audit M13), with the event values behind them. */
export interface RiskResult {
  points: { rp: ReturnPeriod; damageInr: Ranged; peopleAffected: Ranged; svi: Record<SviKey, { damageInr: number; peopleAffected: number }> }[];
  /** ₹ per year */
  ead: Ranged;
  /** people affected per year */
  peoplePerYear: Ranged;
  /** central EAD and people affected per year by SVI class of the census unit */
  bySvi: Record<SviKey, { ead: number; peoplePerYear: number }>;
}

/**
 * Run the event at every return period (each with its own hazard inputs, from `ctxAt`) and integrate
 * damage and people affected over the annual exceedance probability (trapezoid, p = 1/RP).
 * Not defined for the high tide + SLR layer, which has no return period. Each bound's EAD uses that bound's
 * event at every return period; `centralOnly` skips the bound runs (they then equal the central value).
 */
export function runRisk(
  ctxAt: (rp: ReturnPeriod) => ModelContext,
  rps: ReturnPeriod[],
  scenario: ScenarioId,
  placements: Placement[],
  exposures: Record<string, Exposure>,
  opts: EventOptions = { slr: { central: 0, lowRise: 0, highRise: 0 } },
  centralOnly = false
): RiskResult | null {
  if (scenario === "slr") return null;
  const points: RiskResult["points"] = [];
  for (const rp of rps) {
    const ctx = ctxAt(rp);
    if (!ctx.grids || !ctx.damage) return null;
    const at = (b: Bound) => runEvent(ctx, scenario, placements, b, ctx.hazardAt?.[b] ?? ctx.hazard, slrAt(opts.slr, b), exposures, !!opts.bundsFailed).impact!;
    const c = at("central");
    const lo = centralOnly ? c : at("low"), hi = centralOnly ? c : at("high");
    points.push({
      rp,
      damageInr: { low: lo.damageInr, central: c.damageInr, high: hi.damageInr },
      peopleAffected: { low: lo.peopleAffected, central: c.peopleAffected, high: hi.peopleAffected },
      svi: Object.fromEntries(SVI_KEYS.map((k) => [k, { ...c.bySvi[k] }])) as Record<SviKey, { damageInr: number; peopleAffected: number }>
    });
  }
  const ann = (f: (p: RiskResult["points"][number]) => number) => expectedAnnual(points.map((p) => ({ rp: p.rp, value: f(p) })));
  const ranged = (f: (p: RiskResult["points"][number], b: Bound) => number): Ranged =>
    ({ low: ann((p) => f(p, "low")), central: ann((p) => f(p, "central")), high: ann((p) => f(p, "high")) });
  return {
    points,
    ead: ranged((p, b) => p.damageInr[b]),
    peoplePerYear: ranged((p, b) => p.peopleAffected[b]),
    bySvi: Object.fromEntries(SVI_KEYS.map((k) => [k, { ead: ann((p) => p.svi[k].damageInr), peoplePerYear: ann((p) => p.svi[k].peopleAffected) }])) as RiskResult["bySvi"]
  };
}

export function totalsOf(segments: ScenarioRun["segments"]): Record<ExposureKey, Ranged | null> {
  const totals = {} as Record<ExposureKey, Ranged | null>;
  for (const c of EXPOSURE_CATEGORIES) {
    let any = false;
    const t = { low: 0, central: 0, high: 0 };
    for (const s of segments) {
      for (const b of ["low", "central", "high"] as const) {
        const v = s[b].risk[c.key];
        if (v !== null) { t[b] += v; any = true; }
      }
    }
    totals[c.key] = any ? t : null;
  }
  return totals;
}

/** The ecology card (audit M14): reported apart from damage, never added to it. */
export interface EcologyResult {
  /** mangrove squeeze at each sea-level horizon */
  squeeze: (SqueezeResult & { label: string })[];
  /** khazan land the event floods over intact bunds, ha (null when the bund-failure scenario is on) */
  khazanOvertoppedHa: number | null;
  /** khazan land the same event would flood if the bunds failed, ha */
  khazanIfBundsFailHa: number;
  /** new tidal habitat from mangrove-lined creeks, ha */
  creekHabitatHa: number;
}

export function runEcology(
  ctx: ModelContext,
  scenario: ScenarioId,
  placements: Placement[],
  exposures: Record<string, Exposure>,
  opts: EventOptions,
  horizons: { label: string; slrM: number }[],
  squeezeParams: { migrationM: number; builtBlockShare: number }
): EcologyResult {
  const hz = ctx.hazard;
  const crest = barrierCrests(ctx.area, placements, ctx.solutions, ctx.segDefs, "central", isAllowed);
  const built = ctx.builtShare ?? new Float32Array(ctx.elevM.length);
  const squeeze = horizons.map(({ label, slrM }) => {
    const tide = fillLevels(ctx.area, ctx.elevM, ctx.inScope, waterSource(ctx.area, "slr", hz, slrM), {
      cellSegment: ctx.cellSegment, crest, bundCrestM: hz.bundCrestM, overlandMPerKm: 0,
      defended: { mask: tideToday(ctx).defended, crestM: hz.defendedCrestM }
    });
    return { label, ...mangroveSqueeze(ctx.area, ctx.elevM, ctx.inScope, built, tide, hz.highTideReferenceM, slrM, squeezeParams.migrationM, squeezeParams.builtBlockShare) };
  });
  const khazanHa = (failed: boolean) => runEvent(ctx, scenario, placements, "central", hz, opts.slr.central, exposures, failed).sum.khazanKm2 * 100;
  let habitat = 0;
  for (const p of placements) {
    const sol = ctx.solutions[p.solutionId];
    if (sol?.instanceParams.some((d) => d.key === "habitatHa")) habitat += p.params.habitatHa ?? sol.instanceParams.find((d) => d.key === "habitatHa")!.default;
  }
  return {
    squeeze,
    khazanOvertoppedHa: opts.bundsFailed ? null : khazanHa(false),
    khazanIfBundsFailHa: khazanHa(true),
    creekHabitatHa: habitat
  };
}
