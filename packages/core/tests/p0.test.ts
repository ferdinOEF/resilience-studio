/**
 * Phase 0 of the model audit (docs/STEP_PROMPT_model_audit_and_metrics.md): acceptance tests,
 * ported to Phase 1's water-level model in metres (M11).
 */
import { AREA, CITATIONS, DERIVED, HAZARD_PARAMS, SOLUTION_BY_ID, hazardParamsAt, hazardValues, modelContext, rangedHazardInputs } from "../src/data";
import { deriveBaseline, isAllowed, runEvent, runScenario, type HazardValues } from "../src/engine/model";
import type { Placement, SegmentDef } from "../src/engine/types";

const ctx = modelContext();
const segDef = (id: string) => (AREA.segments as SegmentDef[]).find((s) => s.id === id)!;
const segIdx = (id: string) => DERIVED.segments.findIndex((s) => s.id === id);
const BASE = deriveBaseline(DERIVED);
const add = (solutionId: string, segmentId: string, params: Record<string, number>): Placement => ({ id: `t-${solutionId}-${segmentId}`, solutionId, segmentId, params });
const event = (placements: Placement[], hz: HazardValues = ctx.hazard, sc: "surge" | "flood" | "compound" = "compound") => runEvent(ctx, sc, placements, "central", hz, 0, {});
const flooded = (placements: Placement[], hz?: HazardValues) => { const s = event(placements, hz).sum; return s.floodedKm2 + s.bundedKm2; };

describe("P0.1 tide reference (audit M1)", () => {
  it("defaults to MHHW +0.6 m with a spring-HHW range to +1.0 m, reasoned and cited", () => {
    const t = HAZARD_PARAMS.highTideReferenceM;
    expect([t.value, t.low, t.high]).toEqual([0.6, 0.6, 1.0]);
    expect(t.grounding).toBe("reasoned_extrapolation");
    expect(t.citations).toContain("mpt_tor_2016_tides");
    expect(CITATIONS.mpt_tor_2016_tides.full).toMatch(/\+1\.9 m.*\+1\.3 m|MHHW|mean higher high water \+1\.9/i);
  });
});

describe("P0.4 siting rules (audit M3)", () => {
  it("each segment has a setting", () => {
    expect((AREA.segments as SegmentDef[]).map((s) => s.setting)).toEqual(["sandy_open_coast", "estuary_bank", "creek", "rocky_coast"]);
  });
  it("rejects a dune on a creek (St Inez) and allows it on the sandy beach (Miramar)", () => {
    expect(isAllowed(SOLUTION_BY_ID.dune, segDef("st_inez_ribandar"))).toBe(false);
    expect(isAllowed(SOLUTION_BY_ID.dune, segDef("miramar_caranzalem"))).toBe(true);
  });
  it("encodes the brief's mapping", () => {
    expect(isAllowed(SOLUTION_BY_ID.breakwater, segDef("st_inez_ribandar"))).toBe(false);
    expect(isAllowed(SOLUTION_BY_ID.breakwater, segDef("dona_paula"))).toBe(true);
    expect(isAllowed(SOLUTION_BY_ID.mangrove, segDef("miramar_caranzalem"))).toBe(false);
    expect(isAllowed(SOLUTION_BY_ID.mangrove, segDef("st_inez_ribandar"))).toBe(true);
    expect(isAllowed(SOLUTION_BY_ID.check_dam, segDef("st_inez_ribandar"))).toBe(true);
    expect(isAllowed(SOLUTION_BY_ID.check_dam, segDef("panjim_riverfront"))).toBe(false);
    expect(isAllowed(SOLUTION_BY_ID.tidal_wetland_polder, segDef("panjim_riverfront"))).toBe(true); // khazan present
    expect(isAllowed(SOLUTION_BY_ID.tidal_wetland_polder, segDef("dona_paula"))).toBe(false);
    for (const s of AREA.segments as SegmentDef[]) expect(isAllowed(SOLUTION_BY_ID.seawall, s)).toBe(true);
  });
  it("a dune placed on St Inez is ignored by the model (map and tables) and flagged", () => {
    const dune = add("dune", "st_inez_ribandar", { crossSectionM2: 60, crestM: 10, frontageShare: 1 });
    const without = event(BASE), withDune = event([...BASE, dune]);
    expect(withDune.sum.floodedKm2).toBe(without.sum.floodedKm2);
    expect(withDune.segments[segIdx("st_inez_ribandar")].flags.map((f) => f.flag)).toContain("not_allowed");
  });
});

describe("P0.2/P0.3 barriers hold below their crest and overtop above it (audit M2/M3)", () => {
  const walls = (crestM: number, frontageShare = 1) => DERIVED.segments.map((s) => add("seawall", s.id, { crestM, frontageShare }));
  it("a crest above the water level holds water off the covered frontage", () => {
    expect(flooded(walls(10))).toBeLessThan(flooded([]));
    expect(event(walls(10)).segments.every((s) => s.flags.every((f) => f.flag !== "overtopped"))).toBe(true);
  });
  it("a crest below the water level is overtopped: same extent as no wall, and flagged", () => {
    expect(flooded(walls(0.1))).toBe(flooded([]));
    expect(event(walls(0.1)).segments.every((s) => s.flags.some((f) => f.flag === "overtopped"))).toBe(true);
  });
  it("partial frontage lets water flank the wall: more flooding than full cover", () => {
    expect(flooded(walls(10, 0.5))).toBeGreaterThanOrEqual(flooded(walls(10, 1)));
  });
  it("a dune eroded away by the FEMA test does not act as a barrier", () => {
    const thin = [add("dune", "miramar_caranzalem", { crossSectionM2: 20, crestM: 10, frontageShare: 1 })];
    expect(flooded(thin)).toBe(flooded([]));
    expect(event(thin).segments[segIdx("miramar_caranzalem")].flags.map((f) => f.flag)).toContain("removed");
  });
});

describe("P0.5 hazard inputs enter the range (audit M4)", () => {
  it("the hazard inputs with a range", () => {
    // Phase 2 adds the rain-at-high-tide inputs (M15) and the people-affected depth (M13)
    expect(rangedHazardInputs().sort()).toEqual([
      "bundCrestM", "drainCapacityMmPerH", "highTideReferenceM", "lambdaFluvialPerKm", "outfallInvertM", "overlandAttenuationMPerKm",
      "peopleAffectedDepthM", "rainBurstHours", "rainDepthMm", "riverStageM", "runoffCoefImpervious", "runoffCoefPervious"
    ]);
  });
  it("the displayed range at default settings covers the one-at-a-time hazard sweep", () => {
    const r = runScenario(ctx, "compound", BASE, {});
    const lo = r.extents.low.sum.floodedKm2, hi = r.extents.high.sum.floodedKm2;
    const params = hazardParamsAt();
    for (const k of rangedHazardInputs()) {
      for (const v of [params[k].low!, params[k].high!]) {
        const one = runEvent(ctx, "compound", BASE, "central", hazardValues({ [k]: v } as Partial<HazardValues>), 0, {}).sum.floodedKm2;
        expect(one).toBeLessThanOrEqual(lo + 1e-12);
        expect(one).toBeGreaterThanOrEqual(hi - 1e-12);
      }
    }
  });
  it("a user override pins that input in every bound", () => {
    expect(hazardValues({ highTideReferenceM: 0.8 }, "low").highTideReferenceM).toBe(0.8);
    expect(hazardValues({ highTideReferenceM: 0.8 }, "high").highTideReferenceM).toBe(0.8);
  });
});
