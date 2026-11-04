/**
 * Phase 2 of the model audit (docs/STEP_PROMPT_model_audit_and_metrics.md): acceptance and unit tests.
 */
import { BASELINE_MEASURES, BUILT_SHARE, CATCHMENTS, DAMAGE, DERIVED, ECOLOGY, ELEV_M, GRIDS, IN_SCOPE, RETURN_PERIODS, SCENARIOS, SOLUTION_BY_ID, modelContext, slrValues } from "../src/data";
import { damageFactor, expectedAnnual, impactOf, type ExposureGrids } from "../src/engine/impact";
import { EXPOSURE_CATEGORIES, runEcology, runEvent, runRisk, runScenario } from "../src/engine/model";
import { closedHours, rainLevels, type RainInputs } from "../src/engine/rain";
import type { ExtentResult } from "../src/engine/inundation";
import type { Placement, ReturnPeriod } from "../src/engine/types";

const ctxAt = (rp: ReturnPeriod) => modelContext({}, rp);
const ctx = modelContext();

describe("P2.3 risk: expected annual damage (M13)", () => {
  it("EAD matches a hand-worked trapezoid over RP 1, 10, 50, 100", () => {
    // p = 1, 0.1, 0.02, 0.01
    // ½(100 + 400)(1 − 0.1) + ½(400 + 900)(0.1 − 0.02) + ½(900 + 1000)(0.02 − 0.01) = 225 + 52 + 9.5 = 286.5
    const pts = [{ rp: 1, value: 100 }, { rp: 10, value: 400 }, { rp: 50, value: 900 }, { rp: 100, value: 1000 }];
    expect(expectedAnnual(pts)).toBeCloseTo(286.5, 9);
    expect(expectedAnnual([...pts].reverse())).toBeCloseTo(286.5, 9);
  });
  it("runRisk's EAD is the trapezoid of its own event damages, with bounds in order", () => {
    const r = runRisk(ctxAt, RETURN_PERIODS, "compound", BASELINE_MEASURES, {})!;
    expect(r.ead.central).toBeCloseTo(expectedAnnual(r.points.map((p) => ({ rp: p.rp, value: p.damageInr.central }))), 6);
    expect(r.ead.high).toBeLessThanOrEqual(r.ead.central);
    expect(r.ead.central).toBeLessThanOrEqual(r.ead.low);
    expect(r.peoplePerYear.central).toBeGreaterThan(0);
    // SVI groups add up to the total
    const sviSum = Object.values(r.bySvi).reduce((a, v) => a + v.ead, 0);
    expect(sviSum).toBeCloseTo(r.ead.central, 3);
  });
  it("is not defined for the high tide + SLR layer (no return period)", () => {
    expect(runRisk(ctxAt, RETURN_PERIODS, "slr", BASELINE_MEASURES, {})).toBeNull();
  });
  it("a measure's benefit = EAD baseline − EAD with the measure, and storage never adds damage", () => {
    const basin: Placement = { id: "b", solutionId: "retention_basin", segmentId: "panjim_riverfront", params: { volumeM3: 200000, catchment: 1 } };
    const base = runRisk(ctxAt, RETURN_PERIODS, "rain", BASELINE_MEASURES, {}, undefined, true)!;
    const withB = runRisk(ctxAt, RETURN_PERIODS, "rain", [...BASELINE_MEASURES, basin], {}, undefined, true)!;
    expect(base.ead.central - withB.ead.central).toBeGreaterThanOrEqual(0);
  });
});

describe("P2.2 depth-damage (M12)", () => {
  it("interpolates the Huizinga Asia curve and multiplies by the maximum damage", () => {
    const res = DAMAGE.curves.residential;
    expect(damageFactor(res, 0)).toBe(0);
    expect(damageFactor(res, 0.25)).toBeCloseTo(res.factor[1] / 2, 9);
    expect(damageFactor(res, 10)).toBe(1);
    // one cell, 1.0 m deep, 100 m² of residential footprint and 50 people
    const n = 4;
    const z = () => new Float32Array(n);
    const grids: ExposureGrids = { pop: z(), m2: { residential: z(), commercial: z(), industrial: z(), roads: z() }, agriHa: z(), buildings: z(), svi: new Int8Array(n).fill(-1) };
    grids.m2.residential[2] = 100; grids.pop[2] = 50; grids.buildings[2] = 1; grids.svi[2] = 2;
    const ext: ExtentResult = { depth: Float32Array.from([0, 0, 1, 0]), floodedCells: [2], bundedCells: [], wetTideCells: [], defendedCells: [] };
    const im = impactOf(ext, grids, DAMAGE, "central", 0.15, () => "seg");
    expect(im.damageInr).toBeCloseTo(100 * DAMAGE.maxDamage.residential.value * res.factor[2], 6);
    expect(im.peopleAffected).toBe(50);
    expect(im.bySvi.higher.damageInr).toBeCloseTo(im.damageInr, 6);
    // below the people-affected depth, nobody counts as affected but the damage stays
    const shallow = impactOf({ ...ext, depth: Float32Array.from([0, 0, 0.1, 0]) }, grids, DAMAGE, "central", 0.15, () => "seg");
    expect(shallow.peopleAffected).toBe(0);
    expect(shallow.damageInr).toBeGreaterThan(0);
    // the least favourable bound takes the top of the maximum-damage range
    expect(impactOf(ext, grids, DAMAGE, "low", 0.15, () => "").damageInr).toBeGreaterThan(im.damageInr);
  });
  it("damage is grouped by SVI class and the groups add up", () => {
    const e = runEvent(ctx, "compound", BASELINE_MEASURES, "central", ctx.hazard, 0.5, {});
    const im = e.impact!;
    const sum = Object.values(im.bySvi).reduce((a, g) => a + g.damageInr, 0);
    expect(sum).toBeCloseTo(im.damageInr, 3);
    expect(im.damageInr).toBeGreaterThan(0);
  });
});

describe("P2.4 ecology (M14)", () => {
  it("flooded mangrove and khazan are no longer counted as exposure", () => {
    expect(EXPOSURE_CATEGORIES.map((c) => c.key)).not.toContain("mangroveKm2");
    expect(EXPOSURE_CATEGORIES.map((c) => c.key)).not.toContain("khazanKm2");
  });
  it("bund failure floods at least as much khazan as overtopping; a seawall never reduces the squeeze", () => {
    const opts = { slr: slrValues("2100", "ssp245") };
    const hz = [{ label: "2100", slrM: opts.slr.central }];
    const sq = { migrationM: ECOLOGY.mangroveMigrationM.value, builtBlockShare: ECOLOGY.builtBlockShare.value };
    const base = runEcology(ctx, "compound", BASELINE_MEASURES, {}, opts, hz, sq);
    expect(base.khazanIfBundsFailHa).toBeGreaterThanOrEqual(base.khazanOvertoppedHa!);
    const wall: Placement = { id: "w", solutionId: "seawall", segmentId: "panjim_riverfront", params: { crestM: 5, frontageShare: 1 } };
    const walled = runEcology(ctx, "compound", [...BASELINE_MEASURES, wall], {}, opts, hz, sq);
    expect(walled.squeeze[0].squeezedHa).toBeGreaterThanOrEqual(base.squeeze[0].squeezedHa);
    expect(walled.squeeze[0].newTidalLandHa).toBeLessThanOrEqual(base.squeeze[0].newTidalLandHa);
    // with no sea-level rise nothing has to move
    expect(runEcology(ctx, "compound", BASELINE_MEASURES, {}, { slr: slrValues("today", "ssp245") }, [{ label: "today", slrM: 0 }], sq).squeeze[0].squeezedHa).toBe(0);
  });
});

describe("P2.5 rain at high tide (M15)", () => {
  const inp = (o: Partial<RainInputs> = {}): RainInputs => ({
    depthMm: 200, burstH: 2, outfallInvertM: 0.3, mhhwM: 0.6, slrM: 0, cImp: 0.8, cPerv: 0.25, drainMmPerH: 1000, ...o
  });
  const cellM2 = DERIVED.grid.data.cellAreaKm2 * 1e6;
  const gate = (k: number): Placement => ({ id: `g${k}`, solutionId: "flap_gate", segmentId: "panjim_riverfront", params: { catchment: k } });
  const gated = [0, 1, 2, 3].map(gate);
  it("stores water while the outfall is closed, even with ample drain capacity", () => {
    // tide above the outfall for longer than the 2-hour burst: everything that falls is stored
    expect(closedHours(0.3, 0, 0.6)).toBeGreaterThan(2);
    const r = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, inp(), gated, SOLUTION_BY_ID, "central");
    for (const c of r.catchments) {
      expect(c.closedH).toBeCloseTo(2, 9);
      expect(c.storedM3).toBeCloseTo(c.runoffM3, 3);
      expect(c.storedM3).toBeGreaterThan(0);
      expect(Number.isFinite(c.levelM)).toBe(true);
    }
    // the ponded volume equals the stored volume (gated, so no tide water in the drains)
    const k = 1;
    let vol = 0;
    for (const i of CATCHMENTS.cells[k]) if (r.level[i] > ELEV_M[i]) vol += (r.level[i] - ELEV_M[i]) * cellM2;
    expect(vol).toBeCloseTo(r.catchments[k].storedM3, 0);
  });
  it("stores nothing when the outfall stays open and the drains can take the runoff", () => {
    const r = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, inp({ outfallInvertM: 2 }), gated, SOLUTION_BY_ID, "central");
    for (const c of r.catchments) {
      expect(c.closedH).toBe(0);
      expect(c.storedM3).toBe(0);
    }
    expect(r.level.every((v) => v === -Infinity)).toBe(true);
  });
  it("sea-level rise keeps the outfall closed longer; pumps and retention reduce what is stored", () => {
    expect(closedHours(0.3, 0.5, 0.6)).toBeGreaterThan(closedHours(0.3, 0, 0.6));
    const long = inp({ burstH: 12 });
    const a = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, long, gated, SOLUTION_BY_ID, "central").catchments[0];
    const b = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, { ...long, slrM: 0.5 }, gated, SOLUTION_BY_ID, "central").catchments[0];
    expect(b.closedH).toBeGreaterThan(a.closedH);
    expect(b.storedM3).toBeGreaterThanOrEqual(a.storedM3);
    const pump: Placement = { id: "p", solutionId: "pumping_station", segmentId: "panjim_riverfront", params: { capacityM3s: 2, catchment: 0 } };
    const c = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, long, [...gated, pump], SOLUTION_BY_ID, "central").catchments[0];
    expect(c.storedM3).toBeLessThan(a.storedM3);
  });
  it("without a flap gate, tide water backs up the drains to the high-tide level", () => {
    const open = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, inp({ depthMm: 0 }), [], SOLUTION_BY_ID, "central");
    const shut = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, inp({ depthMm: 0 }), gated, SOLUTION_BY_ID, "central");
    expect(open.catchments.some((c) => c.backflow && c.levelM === 0.6)).toBe(true);
    expect(shut.level.every((v) => v === -Infinity)).toBe(true);
  });
  it("is a hazard layer with a return period, and a rarer rainfall floods at least as much", () => {
    expect(SCENARIOS.map((s) => s.id)).toContain("rain");
    const km2 = (rp: ReturnPeriod) => runEvent(ctxAt(rp), "rain", BASELINE_MEASURES, "central", ctxAt(rp).hazard, 0, {}).sum.floodedKm2;
    expect(km2(100)).toBeGreaterThanOrEqual(km2(1));
    expect(km2(100)).toBeGreaterThan(0);
  });
  it("Mala's existing pumps, lake and gates keep the Mala catchment from ponding at RP 100", () => {
    const e = runEvent(ctxAt(100), "rain", BASELINE_MEASURES, "central", ctxAt(100).hazard, 0, {});
    const mala = e.rain!.find((c) => c.id === "mala")!;
    expect(mala.backflow).toBe(false);
    expect(mala.storedM3).toBe(0);
  });
});

describe("P2.6 compound (M16)", () => {
  it("has no cap: the compound shoreline level is MHHW + surge + river", () => {
    const e = runEvent(ctx, "compound", [], "central", ctx.hazard, 0, {});
    for (const s of e.segments) {
      expect(s.shorelineWlM).toBeCloseTo(s.water.baseM + s.water.stormM + s.water.riverM, 9);
    }
    expect(Object.keys(ctx.hazard)).not.toContain("compoundCap");
  });
});

describe("P2.1 exposure layers", () => {
  it("people and buildings come from the grids, and the in-scope people are within 3x of the census", () => {
    let pop = 0, bld = 0;
    for (let i = 0; i < GRIDS.pop.length; i++) if (IN_SCOPE[i]) { pop += GRIDS.pop[i]; bld += GRIDS.buildings[i]; }
    expect(pop).toBeGreaterThan(70991 / 3);
    expect(pop).toBeLessThan(70991 * 3);
    expect(bld).toBeGreaterThan(1000);
    const r = runScenario(ctx, "compound", BASELINE_MEASURES, {});
    expect(r.totals.buildings!.central).toBeGreaterThan(0);
  });
});
