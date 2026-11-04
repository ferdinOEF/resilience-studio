import { AREA, CITATIONS, DERIVED, GRID_DATA, SOLUTIONS, citationIdsInUse, modelContext } from "../src/data";
import { defaultExposure, deriveBaseline, runScenario } from "../src/engine/model";
import type { Placement } from "../src/engine/types";

const ctx = modelContext();
const exp = Object.fromEntries(DERIVED.segments.map((s) => [s.id, defaultExposure(s)]));
const baseline = deriveBaseline(DERIVED);
const idx = (id: string) => DERIVED.segments.findIndex((s) => s.id === id);

describe("case-study grid", () => {
  it("reproduces the published CRZ areas for the well-resolved classes (within 10%)", () => {
    for (const name of [
      "CRZ-IA (mangrove/ecologically sensitive)",
      "CRZ-III NDZ (0-200m No Development Zone)",
      "CRZ-III (200-500m from HTL)",
      "CRZ-IVB (tidal water body / river channel)"
    ]) {
      const c = GRID_DATA.areaCheck[name];
      expect(Math.abs(c.grid_km2 - c.published_km2) / c.published_km2).toBeLessThan(0.1);
    }
  });
  it("gives every segment a shoreline", () => {
    for (const s of DERIVED.segments) expect(s.shoreCells.length).toBeGreaterThan(20);
  });
  it("analyses only Panjim's four same-bank segments", () => {
    expect(DERIVED.segments.map((s) => s.id).sort()).toEqual(["dona_paula", "miramar_caranzalem", "panjim_riverfront", "st_inez_ribandar"]);
  });
});

describe("water levels at the shoreline (audit M11)", () => {
  const surge = runScenario(ctx, "surge", [], exp);
  const flood = runScenario(ctx, "flood", [], exp);
  const compound = runScenario(ctx, "compound", [], exp);
  it("the storm tide is carried flat over the estuary: with no measures every segment meets the storm tide", () => {
    for (const s of surge.segments) expect(s.central.shorelineWlM).toBeCloseTo(ctx.hazard.stormTideM, 9);
  });
  it("river stage is higher upstream (St Inez) than at the bay (Miramar)", () => {
    expect(flood.segments[idx("st_inez_ribandar")].central.water.riverM0).toBeGreaterThan(flood.segments[idx("miramar_caranzalem")].central.water.riverM0);
  });
  it("compound is at least as high as the storm tide alone everywhere (Wahl 2015; Moftakhari 2017)", () => {
    compound.segments.forEach((s, i) => expect(s.central.shorelineWlM).toBeGreaterThanOrEqual(surge.segments[i].central.shorelineWlM - 1e-9));
  });
});

describe("baseline and scenarios", () => {
  it("derives existing mangrove and khazan measures from the data", () => {
    expect(baseline.some((p) => p.segmentId === "panjim_riverfront" && p.solutionId === "mangrove")).toBe(true);
    expect(baseline.some((p) => p.segmentId === "st_inez_ribandar" && p.solutionId === "tidal_wetland_polder")).toBe(true);
    expect(baseline.every((p) => p.existing)).toBe(true);
  });
  it("adding a mangrove belt lowers the water level and the flooding; removing existing mangroves raises them", () => {
    const i = idx("panjim_riverfront");
    const base = runScenario(ctx, "surge", baseline, exp);
    // a belt where mangroves can grow (siting rules, audit M3: estuary bank / creek, not the sandy beach)
    const more: Placement[] = [...baseline, { id: "m", solutionId: "mangrove", segmentId: "panjim_riverfront", params: { widthM: 300, maturity: 1 } }];
    const withMore = runScenario(ctx, "surge", more, exp);
    expect(withMore.segments[i].central.shorelineWlM).toBeLessThan(base.segments[i].central.shorelineWlM);
    expect(withMore.extents.central.sum.floodedKm2).toBeLessThanOrEqual(base.extents.central.sum.floodedKm2);
    // the existing belts are 54–98 m wide, so at 26 cm/km they lower the surge by only 1–3 cm
    const cleared = runScenario(ctx, "surge", baseline.filter((p) => p.solutionId !== "mangrove"), exp);
    expect(cleared.segments[i].central.shorelineWlM).toBeGreaterThan(base.segments[i].central.shorelineWlM);
    expect(cleared.extents.central.sum.floodedKm2).toBeGreaterThanOrEqual(base.extents.central.sum.floodedKm2);
  });
  it("orders bounds: most-protective <= central <= least-protective", () => {
    for (const k of ["urbanKm2", "buildings"] as const) {
      const t = runScenario(ctx, "compound", baseline, exp).totals[k]!;
      expect(t.high).toBeLessThanOrEqual(t.central);
      expect(t.central).toBeLessThanOrEqual(t.low);
    }
  });
  it("leaves the population result uncomputed until a population is entered", () => {
    expect(runScenario(ctx, "surge", baseline, exp).totals.population).toBeNull();
  });
});

describe("data discipline", () => {
  it("every citation id used in the data exists in citations.json", () => {
    for (const id of citationIdsInUse()) expect(CITATIONS[id], id).toBeDefined();
  });
  it("every solution parameter carries a grounding tag", () => {
    for (const s of SOLUTIONS) {
      for (const e of s.effects) for (const p of Object.values(e.params)) expect(p.grounding).toMatch(/solid_direct|reasoned_extrapolation|placeholder_needs_calibration/);
      for (const d of s.instanceParams) expect(d.grounding).toBeDefined();
    }
  });
  it("the grid-derived segments match the case-study config", () => {
    expect(DERIVED.segments.map((s) => s.id)).toEqual(AREA.segments.map((s) => s.id));
  });
});
