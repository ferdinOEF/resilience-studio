/**
 * Phase 3 of the model audit (docs/STEP_PROMPT_model_p3_accuracy.md): acceptance and unit tests.
 */
import { BASELINE_MEASURES, BUILT_SHARE, CATCHMENTS, EXPOSURE_GRID, GRIDS, POPULATION, POP_GRID, POP_RESCALE, SVI, CITATIONS, ELEV_M, FIELD_BUNDS, FIELD_BUND_CELLS, GRID, HAZARD_PARAMS, RAIN, SOLUTION_BY_ID, STORM_TIDE, cellAt, modelContext } from "../src/data";
import { isBunded } from "../src/engine/grid";
import { runEvent, tideToday } from "../src/engine/model";
import { rainLevels } from "../src/engine/rain";
import type { ReturnPeriod, ScenarioId } from "../src/engine/types";

const ev = (sc: ScenarioId, rp: ReturnPeriod, hz: Record<string, number> = {}, bundsFailed = false) => {
  const ctx = modelContext({}, rp);
  return runEvent(ctx, sc, BASELINE_MEASURES, "central", { ...ctx.hazard, ...hz }, 0, {}, bundsFailed);
};

describe("A1 field bunds and spring high water", () => {
  it("the Patto, Taleigao and St Inez / Merces fields are bund-protected land, grounded in Ferdin's field knowledge", () => {
    expect(FIELD_BUND_CELLS.taleigao).toBeGreaterThan(400);
    expect(FIELD_BUND_CELLS.patto).toBeGreaterThan(100);
    expect(FIELD_BUND_CELLS.st_inez_merces).toBeGreaterThan(50);
    expect(FIELD_BUNDS.citations).toContain("ferdin2026_field_bunds");
    expect(CITATIONS.ferdin2026_field_bunds).toBeDefined();
    expect(FIELD_BUNDS.grounding).toBe("reasoned_extrapolation");
    let n = 0;
    for (let i = 0; i < GRID.fieldBund.length; i++) if (GRID.fieldBund[i]) { n++; expect(GRID.khazan[i]).toBe(0); expect(isBunded(GRID, i)).toBe(true); }
    expect(n).toBe(FIELD_BUND_CELLS.taleigao + FIELD_BUND_CELLS.patto + FIELD_BUND_CELLS.st_inez_merces);
  });
  it("the fields are traced polygons, not boxes: built low land at Patto Plaza is not behind a bund", () => {
    expect(FIELD_BUNDS.polygons.length).toBeGreaterThan(0);
    expect(FIELD_BUNDS.trace.cells).toBeGreaterThan(Object.values(FIELD_BUND_CELLS).reduce((a, v) => a + v, 0));
    const plaza = cellAt(73.8346, 15.4952);
    expect(GRID.fieldBund[plaza]).toBe(0);
  });
  it("spring high water is +1.0 m above MSL, from the same chart as MHHW", () => {
    const p = HAZARD_PARAMS.springHighWaterM;
    expect(p.value).toBe(1.0);
    expect(p.grounding).toBe("reasoned_extrapolation");
    expect(p.citations).toEqual(HAZARD_PARAMS.highTideReferenceM.citations);
  });
  it("calibration: a spring high tide with no storm and no rain floods no new land", () => {
    const ctx = modelContext({}, 1);
    const e = ev("surge", 1, { stormTideM: ctx.hazard.springHighWaterM });
    expect(e.sum.floodedKm2).toBe(0);
    expect(e.sum.bundedKm2).toBe(0);
    expect(e.impact!.damageInr).toBe(0);
  });
  it("land between MHHW and spring high water outside the bunds is held up to the 1-year storm tide, and shown apart", () => {
    const ctx = modelContext({}, 1);
    const t = tideToday(ctx);
    const z = ctx.elevM;
    for (let i = 0; i < t.defended.length; i++) {
      if (!t.defended[i]) continue;
      // dry at today's high tide (above MHHW, or a pocket the high tide cannot reach), below spring high water
      expect(t.level[i] > z[i]).toBe(false);
      expect(z[i]).toBeLessThanOrEqual(ctx.hazard.springHighWaterM);
      expect(isBunded(GRID, i)).toBe(false);
      expect(["M", "W"]).not.toContain(GRID.cls[i]);
    }
    expect(ctx.hazard.defendedCrestM).toBe(STORM_TIDE["1"].value);
    const rp1 = ev("surge", 1);
    for (const i of rp1.ext.floodedCells) expect(t.defended[i]).toBe(0);
    expect(rp1.sum.defendedKm2).toBeGreaterThan(0);
    // above their assumed crest the defences are overtopped and the land counts as newly flooded
    const high = ev("surge", 1, { stormTideM: 2.5 });
    expect(high.ext.floodedCells.some((i) => t.defended[i])).toBe(true);
    // with the bund-failure toggle the unmapped defences fail too
    const failed = ev("surge", 1, {}, true);
    expect(failed.sum.defendedKm2).toBe(0);
  });
  it("a 1-year storm tide no longer floods the fields: under 1 km² newly flooded", () => {
    expect(ev("surge", 1).sum.floodedKm2).toBeLessThan(1);
  });
});

describe("A4 rain lands where it falls", () => {
  it("each catchment is split into outlet sub-catchments of about 1 km², unless one outlet cell alone drains more", () => {
    expect(RAIN.subCatchmentKm2.value).toBe(1);
    expect(RAIN.subCatchmentKm2.grounding).toBe("placeholder_needs_calibration");
    const ourem = CATCHMENTS.defs.findIndex((d) => d.id === "ourem");
    expect(CATCHMENTS.subs.filter((s) => s.catchment === ourem).length).toBeGreaterThan(5);
    // every land cell of a catchment is in exactly one of its sub-catchments
    CATCHMENTS.defs.forEach((_, k) => {
      const n = CATCHMENTS.subs.filter((s) => s.catchment === k).reduce((a, s) => a + s.cells.length, 0);
      expect(n).toBe(CATCHMENTS.cells[k].length);
    });
  });
  it("hollows store rain only inside DeltaDTM's domain (rim at or below 10 m)", () => {
    expect(CATCHMENTS.pits.length).toBeGreaterThan(0);
    for (const p of CATCHMENTS.pits) {
      expect(p.rimM).toBeLessThanOrEqual(10);
      for (const i of p.cells) expect(ELEV_M[i]).toBeLessThan(p.rimM);
    }
  });
  it("conserves the stored volume with the water held in hollows and near the creek (outfalls gated)", () => {
    const cellM2 = GRID.data.cellAreaKm2 * 1e6;
    const gated = CATCHMENTS.defs.map((_, k) => ({ id: `g${k}`, solutionId: "flap_gate", segmentId: "panjim_riverfront", params: { catchment: k } }));
    const r = rainLevels(CATCHMENTS, ELEV_M, cellM2, BUILT_SHARE, { depthMm: 300, burstH: 6, outfallInvertM: 0.3, mhhwM: 0.6, slrM: 0, cImp: 0.8, cPerv: 0.25, drainMmPerH: 20 }, gated, SOLUTION_BY_ID, "central");
    const ourem = CATCHMENTS.defs.findIndex((d) => d.id === "ourem");
    expect(r.catchments[ourem].localM3).toBeGreaterThan(0);
    r.catchments.forEach((c, k) => {
      let vol = 0;
      for (const i of CATCHMENTS.cells[k]) if (r.level[i] > ELEV_M[i]) vol += (r.level[i] - ELEV_M[i]) * cellM2;
      expect(vol).toBeCloseTo(c.storedM3, -1);
    });
  });
});

describe("A8 people rescaled to the census towns", () => {
  it("nobody lives on khazan paddy or in the mangrove", () => {
    for (let i = 0; i < GRIDS.pop.length; i++) if (GRID.khazan[i] || GRID.cls[i] === "M") expect(GRIDS.pop[i]).toBe(0);
  });
  it("each census-town group sums to its Census 2011 total × growth × the town's share inside the window", () => {
    const g = POPULATION.rescale.growthFactor;
    expect(g.value).toBe(1);
    expect(g.grounding).toBe("placeholder_needs_calibration");
    expect(POP_RESCALE).toHaveLength(POPULATION.rescale.groups.length);
    const unitOf = new Int32Array(GRIDS.pop.length);
    const cu = (EXPOSURE_GRID as unknown as { censusUnit: number[] }).censusUnit;
    for (let k = 0; k < cu.length; k += 2) unitOf[cu[k]] = cu[k + 1];
    for (const grp of POPULATION.rescale.groups) {
      const idx = grp.codes.map((c) => EXPOSURE_GRID.censusUnitCodes.indexOf(c) + 1);
      let sum = 0;
      for (let i = 0; i < GRIDS.pop.length; i++) if (idx.includes(unitOf[i])) sum += GRIDS.pop[i];
      const want = grp.codes.reduce((a, c) => a + SVI.units.find((u) => u.code2001 === c)!.population2011 * POP_GRID.censusTowns[c].windowShare, 0) * g.value;
      expect(sum).toBeCloseTo(want, -1);
    }
  });
});
