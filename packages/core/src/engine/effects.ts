/**
 * Generic mechanism implementations (build spec §5/§7). Each EffectKind is
 * implemented exactly once. Solutions only reference kinds and supply
 * parameters from solutions.json; there is no per-solution branch here.
 *
 * Since the model audit's Phase 1 (M11) the effects act on water levels in
 * metres at the segment's shoreline, plus the open-coast wave indicator.
 */
import type { Bound, EffectDef, Param, Placement, ScenarioId, SolutionDef } from "./types";

/** Resolve a parameter at a bound: "low" = least protective end of its range. */
export function paramAt(p: Param, bound: Bound): number {
  if (bound === "central" || p.low === undefined || p.high === undefined) return p.value;
  const protectiveEnd = p.moreProtective === "lower" ? p.low : p.high;
  const weakEnd = p.moreProtective === "lower" ? p.high : p.low;
  return bound === "high" ? protectiveEnd : weakEnd;
}

export interface WorkStep {
  label: string;
  formula: string;
  value: number;
  /** unit of value, for the "show your work" panel (default m) */
  unit?: string;
  /** Solution/placement that produced this step, if any. */
  placementId?: string;
  /**
   * removed / breached / overtopped: the measure gave no protection this event.
   * not_allowed: the measure is not sited on a setting it can work in (audit M3), so it is ignored.
   * scour / squeeze: advisory side-effects of a barrier (toe scour on a sandy beach; coastal squeeze of mangroves).
   */
  flag?: "removed" | "breached" | "overtopped" | "not_allowed" | "scour" | "squeeze";
}

/** Water state at a segment's shoreline that the effects act on (audit M11: metres, not an index). */
export interface HazardState {
  /** open-coast wave indicator: share of open-sea wave energy reaching the frontage (0–1); not part of the water level */
  wave: number;
  /** storm surge above the normal high tide (m): the part of the storm tide mangroves can attenuate */
  stormM: number;
  /** river stage above the tide at the shoreline (m) */
  riverM: number;
  /** river floodwater volume (m³) on the segment's low-lying land: riverM × low-lying area */
  floodVolumeM3: number;
  scenario: ScenarioId;
  /** still-water level at the shoreline (m above MSL), set before the barrier pass */
  wlM: number;
  /** the segment's frontage setting, for barrier side-effect flags */
  setting?: string;
  /** whether mangroves front this segment (existing belt or a placed mangrove) */
  hasMangrove?: boolean;
}

/**
 * A crest barrier as the extent model needs it: crest level and the share of frontage covered,
 * or null if it does not act this event (a dune eroded away by the FEMA test).
 */
export function barrierSpec(sol: SolutionDef, pl: Placement, bound: Bound): { crestM: number; frontageShare: number } | null {
  const eff = sol.effects.find((e) => e.kind === "crest_barrier");
  if (!eff) return null;
  const I = (k: string) => pl.params[k] ?? sol.instanceParams.find((d) => d.key === k)?.default ?? 0;
  if (eff.params.retainedThresholdM2 && I("crossSectionM2") < paramAt(eff.params.retainedThresholdM2, bound)) return null;
  return { crestM: I("crestM"), frontageShare: Math.min(1, Math.max(0, I("frontageShare"))) };
}

export type Stage = "fluvial" | "seaward" | "barrier" | "drainage";

/** Which pass of the model each kind belongs to (see model.ts for the order). */
export const STAGE_OF: Record<EffectDef["kind"], Stage> = {
  flood_storage: "fluvial",
  flood_storage_with_breach: "fluvial",
  wave_transmission: "seaward",
  wave_attenuation_per_100m: "seaward",
  level_attenuation_per_km: "seaward",
  crest_barrier: "barrier",
  rain_retention: "drainage",
  rain_pumping: "drainage",
  drain_capacity: "drainage",
  backflow_gate: "drainage"
};

/**
 * Apply one effect of one placed solution to the hazard state, in place.
 * Returns the steps it contributed to the "show your work" trace.
 */
export function applyEffect(
  eff: EffectDef,
  sol: SolutionDef,
  pl: Placement,
  s: HazardState,
  bound: Bound
): WorkStep[] {
  const P = (k: string) => paramAt(eff.params[k], bound);
  const I = (k: string) => pl.params[k] ?? sol.instanceParams.find((d) => d.key === k)?.default ?? 0;
  const tag = `${sol.name}${pl.existing ? " (existing)" : ""}`;
  const storms = s.scenario === "surge" || s.scenario === "compound";

  switch (eff.kind) {
    case "wave_attenuation_per_100m": {
      if (!storms) return [];
      const r = P("reductionPer100m") * I("maturity");
      const f = Math.pow(1 - r, I("widthM") / 100);
      s.wave *= f;
      return [{ label: `${tag}: wave attenuation (open-coast wave indicator)`, formula: `W × (1 − ${r.toFixed(3)})^(${I("widthM")}/100) → ×${f.toFixed(3)}`, value: s.wave, unit: "share", placementId: pl.id }];
    }
    case "level_attenuation_per_km": {
      // McIvor et al. 2012b: surge lowered by cm per km of mangrove, applied directly in metres (audit M11).
      if (!storms) return [];
      const m = (P("reductionCmPerKm") * I("maturity") * (I("widthM") / 1000)) / 100;
      const cut = Math.min(s.stormM, m);
      s.stormM -= cut;
      return [{ label: `${tag}: surge lowered`, formula: `${P("reductionCmPerKm")} cm/km × ${I("maturity")} × ${I("widthM") / 1000} km = ${(m * 100).toFixed(1)} cm (at most the surge above high tide)`, value: -cut, placementId: pl.id }];
    }
    case "wave_transmission": {
      if (!storms) return [];
      const kt = P("transmissionCoefficient");
      s.wave *= kt;
      return [{ label: `${tag}: wave transmission (open-coast wave indicator)`, formula: `W × Kt(${kt.toFixed(3)})`, value: s.wave, unit: "share", placementId: pl.id }];
    }
    case "crest_barrier": {
      // Audit M2/M3: a seawall or dune works by crest height (EurOtop 2018), not by reflection or a flat %.
      const out: WorkStep[] = [];
      if (eff.params.retainedThresholdM2) {
        const area = I("crossSectionM2");
        const need = P("retainedThresholdM2");
        if (area < need) {
          return [{ label: `${tag}: REMOVED by erosion, ${area} m² < ${need} m² needed (FEMA 540 test)`, formula: "no protection this event", value: area, unit: "m²", placementId: pl.id, flag: "removed" }];
        }
        out.push({ label: `${tag}: survives erosion (${area} m² ≥ ${need} m²)`, formula: "FEMA 540 test passed", value: area, unit: "m²", placementId: pl.id });
      }
      const crest = I("crestM");
      const share = Math.min(1, Math.max(0, I("frontageShare")));
      if (s.wlM > crest) {
        out.push({ label: `${tag}: OVERTOPPED, water level ${s.wlM.toFixed(2)} m > crest ${crest} m`, formula: "no protection this event", value: crest, placementId: pl.id, flag: "overtopped" });
      } else {
        // Held: the map blocks water on the covered frontage; the uncovered share still lets water in (flanking).
        s.wave *= 1 - share;
        out.push({ label: `${tag}: HELD, water level ${s.wlM.toFixed(2)} m ≤ crest ${crest} m`, formula: `holds ${Math.round(share * 100)}% of the frontage; water can still enter over the other ${Math.round((1 - share) * 100)}% (map)`, value: crest, placementId: pl.id });
      }
      if (eff.params.reflectionCoefficient && s.setting === "sandy_open_coast") {
        out.push({ label: `${tag}: toe-scour / beach-loss risk`, formula: `reflective wall on a sandy beach (Kr ≈ ${P("reflectionCoefficient").toFixed(2)}); not modelled, flagged`, value: P("reflectionCoefficient"), unit: "Kr", placementId: pl.id, flag: "scour" });
      }
      if (s.hasMangrove) {
        out.push({ label: `${tag}: coastal squeeze of mangroves`, formula: "a barrier behind mangroves blocks their landward migration as the sea rises; not modelled, flagged", value: 0, unit: "", placementId: pl.id, flag: "squeeze" });
      }
      return out;
    }
    case "flood_storage": {
      if (s.scenario === "surge" || s.scenario === "slr" || s.floodVolumeM3 <= 0) return [];
      const storage = P("storageM3PerHa") * I("areaHa") * I("condition");
      return [drawDown(s, storage, `${tag}: storage ${fmtM3(storage)}`, pl.id)];
    }
    case "flood_storage_with_breach": {
      if (s.scenario === "surge" || s.scenario === "slr" || s.floodVolumeM3 <= 0) return [];
      const cap = I("capacityM3");
      const ratio = P("breachRatio");
      if (s.floodVolumeM3 > cap * ratio) {
        return [{ label: `${tag}: BREACHED, inflow ${fmtM3(s.floodVolumeM3)} > ${ratio} × ${fmtM3(cap)}`, formula: "no storage this event", value: s.riverM, placementId: pl.id, flag: "breached" }];
      }
      return [drawDown(s, cap, `${tag}: storage ${fmtM3(cap)}`, pl.id)];
    }
    // drainage measures act on a creek catchment's volume balance (rain.ts), not on the shoreline water level
    case "rain_retention":
    case "rain_pumping":
    case "drain_capacity":
    case "backflow_gate":
      return [];
  }
}

/** What a creek catchment's drainage measures add up to (rain at high tide, audit M15). */
export interface DrainageState {
  retentionM3: number;
  pumpM3s: number;
  addedCapacityM3s: number;
  /** a flap or sluice gate stops tide water backing up the drains */
  gated: boolean;
}

/** Apply one drainage effect of one placed solution to its catchment's state, in place. */
export function applyDrainageEffect(eff: EffectDef, sol: SolutionDef, pl: Placement, s: DrainageState, bound: Bound): WorkStep[] {
  const P = (k: string) => paramAt(eff.params[k], bound);
  const I = (k: string) => pl.params[k] ?? sol.instanceParams.find((d) => d.key === k)?.default ?? 0;
  const tag = `${sol.name.split(" (")[0]}${pl.existing ? " (existing)" : ""}`;
  switch (eff.kind) {
    case "rain_retention": {
      const v = I("volumeM3") * P("usableShare");
      s.retentionM3 += v;
      return [{ label: `${tag}: retention`, formula: `${fmtM3(I("volumeM3"))} × ${P("usableShare")} free at the start`, value: v, unit: "m³", placementId: pl.id }];
    }
    case "rain_pumping": {
      const q = I("capacityM3s") * P("availability");
      s.pumpM3s += q;
      return [{ label: `${tag}: pumping`, formula: `${I("capacityM3s")} m³/s × ${P("availability")} delivered`, value: q, unit: "m³/s", placementId: pl.id }];
    }
    case "drain_capacity": {
      s.addedCapacityM3s += I("addedCapacityM3s");
      return [{ label: `${tag}: added drain capacity`, formula: "while the outfall is open", value: I("addedCapacityM3s"), unit: "m³/s", placementId: pl.id }];
    }
    case "backflow_gate":
      s.gated = true;
      return [{ label: `${tag}: outfalls gated`, formula: "tide water cannot back up the drains", value: 1, unit: "", placementId: pl.id }];
    default:
      return [];
  }
}

/** Storage subtracts its volume from the river water on the segment's low-lying land, lowering the river stage in proportion. */
function drawDown(s: HazardState, storage: number, label: string, placementId: string): WorkStep {
  const before = s.floodVolumeM3;
  const after = Math.max(0, before - storage);
  const r0 = s.riverM;
  s.riverM *= before > 0 ? after / before : 0;
  s.floodVolumeM3 = after;
  return { label, formula: `river stage × (${fmtM3(before)} − stored) / ${fmtM3(before)} → volume ${fmtM3(after)}`, value: s.riverM - r0, placementId };
}

export function fmtM3(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} Mm³`;
  if (v >= 1e3) return `${Math.round(v / 1e3).toLocaleString()} k m³`;
  return `${Math.round(v)} m³`;
}
