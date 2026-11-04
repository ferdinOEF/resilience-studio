/**
 * From resolved registry values to the engine's inputs. The engine's data files hold the same numbers the registry was
 * seeded from; at run time the chain reads the registry (resolved for the place, local overrides national) and the run
 * records every version it used. An approved registry edit therefore changes the next run, and the old run goes stale.
 */
import { DAMAGE as DAMAGE_DATA, DEFAULT_RP, hazardParamsAt, modelContext, SLR, SOLUTION_BY_ID, type Bound, type DamageModel, type HazardValues, type ModelContext, type Param, type ReturnPeriod, type SlrInput, type SolutionDef } from "@resilience/core";
import type { Resolved } from "@resilience/registry";

export type ResolvedMap = Map<string, Resolved>;

function scalar(r: Resolved | undefined): { value: number; low?: number; high?: number } | null {
  if (!r || r.entry.value.type !== "scalar") return null;
  return { value: r.entry.value.value, low: r.entry.value.low, high: r.entry.value.high };
}

/** Apply a resolved scalar to a data-file Param (value and range), keeping its metadata. */
function patchParam(p: Param, r: Resolved | undefined, used: Set<string>, id: string): Param {
  const s = scalar(r);
  if (!s) return p;
  used.add(id);
  return { ...p, value: s.value, low: s.low ?? p.low, high: s.high ?? p.high };
}

const HAZARD_PARAM_IDS: (keyof HazardValues)[] = ["highTideReferenceM", "springHighWaterM", "lambdaWavePerKm", "lambdaFluvialPerKm", "overlandAttenuationMPerKm", "bundCrestM", "rainBurstHours", "outfallInvertM", "runoffCoefImpervious", "runoffCoefPervious", "drainCapacityMmPerH"];

/** The hazard inputs at a return period, each as a Param with the registry's value and range where the registry has one. */
export function hazardParamsFromRegistry(resolved: ResolvedMap, rp: ReturnPeriod, used: Set<string>): Record<keyof HazardValues, Param> {
  const base = hazardParamsAt(rp);
  const out = { ...base };
  for (const k of HAZARD_PARAM_IDS) out[k] = patchParam(base[k], resolved.get(`hazards.params.${k}`), used, `hazards.params.${k}`);
  out.stormTideM = patchParam(base.stormTideM, resolved.get(`hazards.stormTideByRp.${rp}`), used, `hazards.stormTideByRp.${rp}`);
  out.defendedCrestM = patchParam(base.defendedCrestM, resolved.get("hazards.stormTideByRp.1"), used, "hazards.stormTideByRp.1");
  out.riverStageM = patchParam(base.riverStageM, resolved.get(`hazards.riverStageByRp.${rp}`), used, `hazards.riverStageByRp.${rp}`);
  out.rainDepthMm = patchParam(base.rainDepthMm, resolved.get(`hazards.rainDepthByRp.${rp}`), used, `hazards.rainDepthByRp.${rp}`);
  out.peopleAffectedDepthM = patchParam(base.peopleAffectedDepthM, resolved.get("damage.peopleAffectedDepthM"), used, "damage.peopleAffectedDepthM");
  return out;
}

/** Hazard values at a bound, as the engine defines them (low = most hazardous end, high = least). */
export function hazardValuesAt(params: Record<keyof HazardValues, Param>, bound: Bound): HazardValues {
  const v = {} as HazardValues;
  for (const [k, p] of Object.entries(params) as [keyof HazardValues, Param][]) {
    if (bound === "central" || p.low === undefined || p.high === undefined || !p.moreHazardous) v[k] = p.value;
    else {
      const worst = p.moreHazardous === "higher" ? p.high : p.low;
      const best = p.moreHazardous === "higher" ? p.low : p.high;
      v[k] = bound === "low" ? worst : best;
    }
  }
  return v;
}

/** Solutions with every effect parameter and instance default taken from the registry where it has one. */
export function solutionsFromRegistry(resolved: ResolvedMap, used: Set<string>): Record<string, SolutionDef> {
  const out: Record<string, SolutionDef> = {};
  for (const [id, sol] of Object.entries(SOLUTION_BY_ID)) {
    out[id] = {
      ...sol,
      effects: sol.effects.map((e) => ({
        ...e,
        params: Object.fromEntries(Object.entries(e.params).map(([k, p]) => [k, patchParam(p, resolved.get(`solutions.${id}.effects.${e.kind}.params.${k}`), used, `solutions.${id}.effects.${e.kind}.params.${k}`)]))
      })),
      instanceParams: sol.instanceParams.map((ip) => {
        const rid = `solutions.${id}.instanceParams.${ip.key}`;
        const s = scalar(resolved.get(rid));
        if (!s) return ip;
        used.add(rid);
        return { ...ip, default: s.value, min: s.low ?? ip.min, max: s.high ?? ip.max };
      })
    };
  }
  return out;
}

/** The depth-damage model with maximum damages from the registry. Curves stay in the data file (table entries mirror them). */
export function damageFromRegistry(resolved: ResolvedMap, used: Set<string>): DamageModel {
  const md = { ...DAMAGE_DATA.maxDamage };
  for (const k of Object.keys(md) as (keyof typeof md)[]) md[k] = patchParam(md[k], resolved.get(`damage.maxDamage.${k}`), used, `damage.maxDamage.${k}`);
  for (const k of Object.keys(DAMAGE_DATA.curves)) if (resolved.has(`damage.curves.${k}`)) used.add(`damage.curves.${k}`);
  return { curves: DAMAGE_DATA.curves, maxDamage: md };
}

/** Sea-level rise for a horizon and pathway from the registry's AR6 Mormugao table (central, likely low, likely high). */
export function slrFromRegistry(resolved: ResolvedMap, horizon: "today" | "2050" | "2100", pathway: "ssp126" | "ssp245" | "ssp585", used: Set<string>): SlrInput {
  if (horizon === "today") return { central: 0, lowRise: 0, highRise: 0 };
  const r = resolved.get("hazards.seaLevelRise");
  if (r && r.entry.value.type === "table") {
    used.add("hazards.seaLevelRise");
    const row = r.entry.value.rows.find((x) => String(x[0]) === horizon && String(x[1]) === pathway);
    if (row) return { central: Number(row[2]), lowRise: Number(row[3]), highRise: Number(row[4]) };
  }
  const [c, lo, hi] = SLR.horizons[horizon][pathway];
  return { central: c, lowRise: lo, highRise: hi };
}

export interface EngineInputs {
  context: ModelContext;
  slr: SlrInput;
  /** registry ids actually read while building the inputs */
  used: string[];
}

/** Build the engine context for one return period from the registry (falls back to the data files where the registry has no entry). */
export function engineInputsFromRegistry(resolved: ResolvedMap, rp: ReturnPeriod = DEFAULT_RP, horizon: "today" | "2050" | "2100" = "today", pathway: "ssp126" | "ssp245" | "ssp585" = "ssp245"): EngineInputs {
  const used = new Set<string>();
  const params = hazardParamsFromRegistry(resolved, rp, used);
  const base = modelContext({}, rp);
  const context: ModelContext = {
    ...base,
    solutions: solutionsFromRegistry(resolved, used),
    damage: damageFromRegistry(resolved, used),
    hazard: hazardValuesAt(params, "central"),
    hazardAt: { low: hazardValuesAt(params, "low"), central: hazardValuesAt(params, "central"), high: hazardValuesAt(params, "high") }
  };
  for (const id of ["datasets.dem", "datasets.crzGrid", "datasets.popGrid", "datasets.exposureGrid", "svi", "defenses"]) if (resolved.has(id)) used.add(id);
  return { context, slr: slrFromRegistry(resolved, horizon, pathway, used), used: [...used].sort() };
}
