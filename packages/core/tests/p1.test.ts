/**
 * Phase 1 of the model audit (docs/STEP_PROMPT_model_audit_and_metrics.md): acceptance tests.
 */
import { CITATIONS, DEM, DEM_SOURCE, DERIVED, ELEV_M, GRIDS, HAZARD_PARAMS, IN_SCOPE, RETURN_PERIODS, RIVER_STAGE, STORM_TIDE, modelContext, slrValues } from "../src/data";
import { isBunded } from "../src/engine/grid";
import { defaultExposure, deriveBaseline, runEvent, runScenario } from "../src/engine/model";
import type { Placement, ReturnPeriod, ScenarioId } from "../src/engine/types";

const BASE = deriveBaseline(DERIVED);
const ctx = modelContext();
const idx = (id: string) => DERIVED.segments.findIndex((s) => s.id === id);
const ev = (sc: ScenarioId, slrM = 0, o: { rp?: ReturnPeriod; placements?: Placement[]; bundsFailed?: boolean; hz?: Partial<typeof ctx.hazard> } = {}) => {
  const c = o.rp ? modelContext({}, o.rp) : ctx;
  return runEvent(c, sc, o.placements ?? BASE, "central", { ...c.hazard, ...o.hz }, slrM, {}, o.bundsFailed);
};

describe("P1.1 one water level in metres (M11)", () => {
  it("the map and the tables come from the same fill: segment results add up to the extent", () => {
    const e = ev("compound", 0.2);
    for (const k of ["floodedKm2", "bundedKm2"] as const) {
      const segSum = e.segments.reduce((a, s) => a + s.extent[k], 0);
      const inSegs = Object.values(e.sum.bySegment).reduce((a, s) => a + s[k], 0);
      expect(segSum).toBeCloseTo(inSegs, 9);
    }
    // the depth map is exactly the newly flooded + behind-bund cells
    const wet = new Set([...e.ext.floodedCells, ...e.ext.bundedCells]);
    e.ext.depth.forEach((d, i) => expect(d > 0).toBe(wet.has(i)));
  });
  it("with no measures, no flooded cell lies above the storm tide + SLR (the level is carried flat, never raised)", () => {
    const slr = 0.3;
    const e = runEvent(ctx, "surge", [], "central", ctx.hazard, slr, {});
    for (const i of e.ext.floodedCells) expect(ELEV_M[i] + e.ext.depth[i]).toBeLessThanOrEqual(ctx.hazard.stormTideM + slr + 1e-6);
  });
  it("mangroves act in cm/km × width directly, at most the surge above MHHW", () => {
    const e = ev("surge");
    const m = BASE.find((p) => p.solutionId === "mangrove" && p.segmentId === "panjim_riverfront")!;
    const s = e.segments[idx("panjim_riverfront")].water;
    const cut = Math.min(s.stormM0, (26 * 1 * m.params.widthM) / 1000 / 100);
    expect(s.stormM0 - s.stormM).toBeCloseTo(cut, 9);
  });
  it("storage subtracts volume from the river part only", () => {
    const e = ev("compound");
    const s = e.segments[idx("st_inez_ribandar")].water;
    expect(s.riverM).toBeLessThan(s.riverM0);
  });
  it("waves are an open-coast indicator, not part of the water level", () => {
    const bw: Placement = { id: "bw", solutionId: "breakwater", segmentId: "dona_paula", params: {} };
    const a = ev("surge"), b = ev("surge", 0, { placements: [...BASE, bw] });
    expect(b.sum.floodedKm2).toBe(a.sum.floodedKm2);
    const i = idx("dona_paula");
    expect(b.segments[i].wave.W).toBeLessThan(a.segments[i].wave.W);
    expect(a.segments[i].wave.openCoast).toBe(true);
    expect(a.segments[idx("st_inez_ribandar")].wave.openCoast).toBe(false);
  });
});

describe("P1.2 return periods (M5)", () => {
  it("storm tide from CoDEC at the point nearest the Mandovi mouth, stored with its id and coordinates", () => {
    expect(STORM_TIDE.source.pointId).toBe("id_coast_glob_12128");
    expect(STORM_TIDE.source.distanceFromMouthKm).toBeLessThan(10);
    expect(RETURN_PERIODS).toEqual([1, 10, 50, 100]);
    let prev = -Infinity;
    for (const rp of RETURN_PERIODS) {
      const p = STORM_TIDE[`${rp}`];
      expect(p.grounding).toBe("reasoned_extrapolation");
      expect(p.citations).toContain("muis2020_codec");
      expect(p.value).toBeGreaterThan(prev);
      prev = p.value;
    }
    expect(STORM_TIDE["100"].value).toBe(1.297);
    expect(CITATIONS.muis2020_codec.full).toMatch(/10\.5281\/zenodo\.3660927/);
  });
  it("river stage stays a placeholder (no CWC or GloFAS series reachable)", () => {
    for (const rp of RETURN_PERIODS) expect(RIVER_STAGE[`${rp}`].grounding).toBe("placeholder_needs_calibration");
  });
  it("the return-period selector works for every storm hazard: a rarer event floods at least as much", () => {
    for (const sc of ["surge", "flood", "compound"] as const) {
      let prev = -Infinity;
      for (const rp of RETURN_PERIODS) {
        const km = ev(sc, 0, { rp }).sum.floodedKm2;
        expect(km).toBeGreaterThanOrEqual(prev);
        prev = km;
      }
    }
  });
});

describe("P1.3 sea-level rise is a modifier on every hazard (M6/M7)", () => {
  it("SLR stacks on a storm tide: the shoreline water level rises by exactly the SLR", () => {
    for (const sc of ["surge", "compound", "flood", "slr"] as const) {
      for (const rp of RETURN_PERIODS) {
        const a = ev(sc, 0, { rp }), b = ev(sc, 0.5, { rp });
        a.segments.forEach((s, i) => expect(b.segments[i].shorelineWlM - s.shorelineWlM).toBeCloseTo(0.5, 9));
      }
    }
  });
  it("the SLR selector works for every hazard: more rise floods at least as much", () => {
    for (const sc of ["surge", "flood", "compound", "slr"] as const) {
      const km = ["today", "2050", "2100"].map((h) => ev(sc, slrValues(h as "today", "ssp585").central).sum.floodedKm2);
      expect(km[0]).toBeLessThanOrEqual(km[1]);
      expect(km[1]).toBeLessThanOrEqual(km[2]);
    }
  });
});

describe("P1.4 terrain model (M8)", () => {
  it("the DEM source is one config value; DeltaDTM is in use, masked above 10 m, with land pits clamped", () => {
    expect(DEM_SOURCE).toBe("deltadtm");
    expect(DEM.source.dataset).toMatch(/DeltaDTM/);
    const st = DEM.stats as unknown as { maxM: number; minM: number; maskedAbove10mPixels: number; pitsClampedTo0: number };
    expect(st.maxM).toBeLessThanOrEqual(10);
    expect(st.minM).toBeGreaterThanOrEqual(-1);
    expect(st.maskedAbove10mPixels).toBeGreaterThan(0);
  });
});

describe("P1.5 bunds and the three wet classes (M9)", () => {
  it("khazan land (and, since Phase 3, the bunded fields) is reported in its own class, never as newly flooded", () => {
    const e = ev("compound", 0.5);
    for (const i of e.ext.floodedCells) expect(isBunded(DERIVED.grid, i)).toBe(false);
    for (const i of e.ext.bundedCells) expect(isBunded(DERIVED.grid, i)).toBe(true);
  });
  it("bunds hold below their crest and are overtopped above it", () => {
    expect(ev("compound", 0, { hz: { bundCrestM: 10 } }).sum.bundedKm2).toBe(0);
    expect(ev("compound", 0, { hz: { bundCrestM: 0 } }).sum.bundedKm2).toBeGreaterThan(0);
  });
  it("bund failure is a scenario toggle that floods at least as much khazan", () => {
    for (const sc of ["surge", "flood", "compound"] as const) {
      expect(ev(sc, 0, { bundsFailed: true }).sum.bundedKm2).toBeGreaterThanOrEqual(ev(sc).sum.bundedKm2);
    }
    expect(ev("compound", 0, { rp: 1, bundsFailed: true }).sum.bundedKm2).toBeGreaterThan(ev("compound", 0, { rp: 1 }).sum.bundedKm2);
  });
  it("the bund crest is a placeholder with a range", () => {
    const b = HAZARD_PARAMS.bundCrestM;
    expect(b.grounding).toBe("placeholder_needs_calibration");
    expect([b.low, b.value, b.high]).toEqual([1, 1.5, 2]);
  });
});

describe("P1.6 overland attenuation (Vafeidis et al. 2019)", () => {
  it("defaults to 0, ranges 0–1 m/km, and lowers only storm-driven flooding", () => {
    const p = HAZARD_PARAMS.overlandAttenuationMPerKm;
    expect([p.value, p.low, p.high]).toEqual([0, 0, 1]);
    expect(p.citations).toContain("vafeidis2019");
    expect(ev("surge", 0, { hz: { overlandAttenuationMPerKm: 1 } }).sum.floodedKm2).toBeLessThanOrEqual(ev("surge").sum.floodedKm2);
    expect(ev("flood", 0, { hz: { overlandAttenuationMPerKm: 1 } }).sum.floodedKm2).toBe(ev("flood").sum.floodedKm2);
  });
});

describe("results", () => {
  it("a segment's exposure inside the flood never exceeds its exposure", () => {
    const exp = Object.fromEntries(DERIVED.segments.map((s) => [s.id, { ...defaultExposure(s, GRIDS, IN_SCOPE), population: 1000 }]));
    const r = runScenario(ctx, "compound", BASE, exp, { slr: slrValues("2100", "ssp585") });
    for (const s of r.segments) for (const b of ["low", "central", "high"] as const) {
      for (const k of ["urbanKm2", "ruralCrzKm2", "population", "buildings"] as const) {
        expect(s[b].risk[k]!).toBeLessThanOrEqual((s[b].exposure[k] as number) + 1e-9);
      }
    }
  });
});
