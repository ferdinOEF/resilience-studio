/**
 * Model agents for the ported chain (spec section 1.3, tier 3): each sets up and executes one model's run from the
 * inputs the Liaison hands it, and returns outputs and anomalies. They never alter inputs or tune parameters; every
 * parameter comes from the registry through the bridge.
 */
import { DAMAGE, LOSS, PEOPLE, WATER_LEVEL, type ModelContract } from "@resilience/contracts";
import { BASELINE_MEASURES, CELL_SEGMENT, DERIVED, defaultExposure, expectedAnnual, GRIDS, impactOf, runEvent, slrAt, type Bound, type Exposure, type ExtentResult, type Placement, type ReturnPeriod } from "@resilience/core";
import { damageFromRegistry, engineInputsFromRegistry, hazardParamsFromRegistry, type ResolvedMap } from "./registry-bridge";
import type { ModelAgent, ModelInputs, ModelOutputs } from "./types";

export interface EventTable { rp: ReturnPeriod; value: number }

function extentFromPorts(upstream: Record<string, unknown>): ExtentResult {
  const depth = upstream.depth as Float32Array;
  const cls = upstream.extent_classes as Uint8Array;
  if (!(depth instanceof Float32Array) || !(cls instanceof Uint8Array) || depth.length !== cls.length) throw new Error("depth and extent_classes grids are required and must align");
  const floodedCells: number[] = [], bundedCells: number[] = [], wetTideCells: number[] = [];
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === 3) floodedCells.push(i);
    else if (cls[i] === 2) bundedCells.push(i);
    else if (cls[i] === 1) wetTideCells.push(i);
  }
  return { depth, floodedCells, bundedCells, wetTideCells, defendedCells: [] };
}

const segIds = DERIVED.segments.map((s) => s.id);
const segmentOf = (i: number) => (CELL_SEGMENT[i] >= 0 ? segIds[CELL_SEGMENT[i]] : "");

export class WaterLevelAgent implements ModelAgent {
  contract: ModelContract = WATER_LEVEL;
  constructor(private resolved: ResolvedMap) {}
  async run(inp: ModelInputs): Promise<ModelOutputs> {
    const { context, slr, used } = engineInputsFromRegistry(this.resolved, inp.return_period, inp.scenario.horizon, inp.scenario.pathway);
    const placements: Placement[] = [...BASELINE_MEASURES, ...inp.scenario.solution_set.placements];
    const exposures: Record<string, Exposure> = Object.fromEntries(context.area.segments.map((s) => [s.id, defaultExposure(s, context.grids, context.inScope)]));
    const hz = context.hazardAt?.[inp.bound] ?? context.hazard;
    const ev = runEvent(context, inp.scenario.hazard, placements, inp.bound, hz, slrAt(slr, inp.bound), exposures, !!inp.scenario.bunds_failed);
    const n = ev.ext.depth.length;
    const cls = new Uint8Array(n);
    for (const i of ev.ext.wetTideCells) cls[i] = 1;
    for (const i of ev.ext.bundedCells) cls[i] = 2;
    for (const i of ev.ext.floodedCells) cls[i] = 3;
    const level = new Float32Array(n).fill(NaN);
    for (const i of ev.ext.floodedCells) level[i] = context.elevM[i] + ev.ext.depth[i];
    for (const i of ev.ext.bundedCells) level[i] = context.elevM[i] + ev.ext.depth[i];
    const anomalies = ev.segments.flatMap((s) => s.flags.map((f) => `${s.segmentId}: ${f.flag ?? f.label}`));
    return {
      ports: {
        water_level: level,
        depth: ev.ext.depth,
        extent_classes: cls,
        shoreline_water_level: ev.segments.map((s) => ({ segment: s.segmentId, wl_m: s.shorelineWlM })),
        /** the engine's per-segment summary, carried for the result digest (not a contract port) */
        _summary: { sum: ev.sum, segments: ev.segments.map((s) => ({ id: s.segmentId, shorelineWlM: s.shorelineWlM, extent: s.extent, flags: s.flags.map((f) => f.flag ?? f.label) })), slr_m: slrAt(slr, inp.bound) }
      },
      anomalies,
      registry_ids_read: used
    };
  }
}

export class DamageAgent implements ModelAgent {
  contract: ModelContract = DAMAGE;
  constructor(private resolved: ResolvedMap) {}
  async run(inp: ModelInputs): Promise<ModelOutputs> {
    const used = new Set<string>();
    const ext = extentFromPorts(inp.upstream);
    const dm = damageFromRegistry(this.resolved, used);
    const params = hazardParamsFromRegistry(this.resolved, inp.return_period, used);
    const im = impactOf(ext, GRIDS, dm, inp.bound, params.peopleAffectedDepthM.value, segmentOf);
    if (this.resolved.has("datasets.exposureGrid")) used.add("datasets.exposureGrid");
    return {
      ports: {
        damage_total: im.damageInr,
        damage_by_segment: Object.entries(im.bySegment).map(([segment, g]) => ({ segment, damage_inr: g.damageInr })),
        buildings_wet: im.buildingsWet,
        _by_class: im.byClass
      },
      anomalies: [],
      registry_ids_read: [...used].sort()
    };
  }
}

export class PeopleAgent implements ModelAgent {
  contract: ModelContract = PEOPLE;
  constructor(private resolved: ResolvedMap) {}
  async run(inp: ModelInputs): Promise<ModelOutputs> {
    const used = new Set<string>();
    const ext = extentFromPorts(inp.upstream);
    const dm = damageFromRegistry(this.resolved, new Set());
    const params = hazardParamsFromRegistry(this.resolved, inp.return_period, used);
    const threshold = params.peopleAffectedDepthM.value;
    used.add("damage.peopleAffectedDepthM");
    const im = impactOf(ext, GRIDS, dm, inp.bound, threshold, segmentOf);
    for (const id of ["datasets.popGrid", "svi"]) if (this.resolved.has(id)) used.add(id);
    return {
      ports: {
        people_total: im.peopleAffected,
        people_by_segment: Object.entries(im.bySegment).map(([segment, g]) => ({ segment, people: g.peopleAffected })),
        people_by_svi: Object.entries(im.bySvi).map(([svi, g]) => ({ svi, people: g.peopleAffected })),
        _people_in_flood: im.peopleInFlood
      },
      anomalies: [],
      registry_ids_read: [...used].sort()
    };
  }
}

export class LossAgent implements ModelAgent {
  contract: ModelContract = LOSS;
  async run(inp: ModelInputs): Promise<ModelOutputs> {
    const d = inp.upstream.damage_by_return_period as EventTable[];
    const p = inp.upstream.people_by_return_period as EventTable[];
    if (!Array.isArray(d) || !Array.isArray(p) || d.length < 2 || p.length < 2) throw new Error("loss needs at least two return periods of damage and people");
    return {
      ports: { expected_annual_damage: expectedAnnual(d), people_per_year: expectedAnnual(p) },
      anomalies: d.length < 4 ? [`EAD integrated over ${d.length} return periods only: a lower bound`] : [],
      registry_ids_read: []
    };
  }
}

export function portedChainAgents(resolved: ResolvedMap): ModelAgent[] {
  return [new WaterLevelAgent(resolved), new DamageAgent(resolved), new PeopleAgent(resolved), new LossAgent()];
}

export const BOUNDS: Bound[] = ["low", "central", "high"];
