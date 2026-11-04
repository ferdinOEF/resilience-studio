import { applyEffect, paramAt, type HazardState } from "../src/engine/effects";
import { SOLUTION_BY_ID } from "../src/data";
import type { Placement } from "../src/engine/types";

const state = (o: Partial<HazardState> = {}): HazardState => ({
  wave: 1, stormM: 1, riverM: 1, floodVolumeM3: 100000, scenario: "compound", wlM: 2.1, ...o
});
const place = (solutionId: string, params: Record<string, number>): Placement => ({ id: "t", solutionId, segmentId: "x", params });
const eff = (id: string, kind: string) => SOLUTION_BY_ID[id].effects.find((e) => e.kind === kind)!;

describe("paramAt", () => {
  const r = eff("mangrove", "wave_attenuation_per_100m").params.reductionPer100m;
  it("returns the literature range ends by protectiveness", () => {
    expect(paramAt(r, "central")).toBe(0.395);
    expect(paramAt(r, "high")).toBe(0.66);
    expect(paramAt(r, "low")).toBe(0.13);
  });
  it("respects moreProtective: lower (breakwater Kt)", () => {
    const kt = eff("breakwater", "wave_transmission").params.transmissionCoefficient;
    expect(paramAt(kt, "high")).toBe(0.075);
    expect(paramAt(kt, "low")).toBe(0.8);
  });
});

describe("mangrove wave attenuation (McIvor et al. 2012a), on the open-coast wave indicator", () => {
  it("100 m of mature mangrove at the 66% ceiling leaves 34% of wave height", () => {
    const s = state();
    applyEffect(eff("mangrove", "wave_attenuation_per_100m"), SOLUTION_BY_ID.mangrove, place("mangrove", { widthM: 100, maturity: 1 }), s, "high");
    expect(s.wave).toBeCloseTo(0.34, 6);
    expect(s.stormM).toBe(1);
  });
  it("compounds per 100 m and scales with maturity", () => {
    const s = state();
    applyEffect(eff("mangrove", "wave_attenuation_per_100m"), SOLUTION_BY_ID.mangrove, place("mangrove", { widthM: 200, maturity: 0.5 }), s, "low");
    expect(s.wave).toBeCloseTo((1 - 0.065) ** 2, 6);
  });
  it("has no effect on a pure river flood", () => {
    const s = state({ scenario: "flood" });
    applyEffect(eff("mangrove", "wave_attenuation_per_100m"), SOLUTION_BY_ID.mangrove, place("mangrove", { widthM: 300, maturity: 1 }), s, "central");
    expect(s.wave).toBe(1);
  });
});

describe("mangrove surge attenuation (McIvor et al. 2012b), in metres directly (audit M11)", () => {
  it("lowers the surge by cm/km × width, with no reference-surge division", () => {
    const s = state();
    applyEffect(eff("mangrove", "level_attenuation_per_km"), SOLUTION_BY_ID.mangrove, place("mangrove", { widthM: 1000, maturity: 1 }), s, "high");
    expect(s.stormM).toBeCloseTo(1 - 0.48, 9);
    expect(s.riverM).toBe(1);
  });
  it("never removes more than the surge above the normal high tide", () => {
    const s = state({ stormM: 0.1 });
    applyEffect(eff("mangrove", "level_attenuation_per_km"), SOLUTION_BY_ID.mangrove, place("mangrove", { widthM: 1000, maturity: 1 }), s, "high");
    expect(s.stormM).toBe(0);
  });
});

describe("seawall as a crest barrier (EurOtop 2018; audit M2)", () => {
  const wall = () => eff("seawall", "crest_barrier");
  it("holds below its crest; the map blocks the covered frontage, the wave indicator drops by the covered share", () => {
    const s = state({ wlM: 2.1 });
    const steps = applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 1 }), s, "central");
    expect(steps.some((x) => /HELD/.test(x.label))).toBe(true);
    expect(s.wave).toBe(0);
    expect(s.stormM).toBe(1); // the water level itself is held back on the map, not lowered
  });
  it("never cuts more than the frontage it covers (flanking)", () => {
    const s = state({ wlM: 2.1 });
    applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 0.4 }), s, "central");
    expect(s.wave).toBeCloseTo(0.6, 9);
  });
  it("is overtopped above its crest and then gives no protection", () => {
    const s = state({ wlM: 2.6 });
    const steps = applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 1 }), s, "central");
    expect(steps.find((x) => x.flag === "overtopped")).toBeTruthy();
    expect(s.wave).toBe(1);
  });
  it("holds at exactly its crest (water level ≤ crest)", () => {
    const steps = applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 1 }), state({ wlM: 2.5 }), "central");
    expect(steps.some((x) => x.flag === "overtopped")).toBe(false);
  });
  it("flags toe scour on a sandy beach and coastal squeeze in front of mangroves", () => {
    const s = state({ wlM: 2.1, setting: "sandy_open_coast", hasMangrove: true });
    const steps = applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 0.5 }), s, "central");
    expect(steps.map((x) => x.flag).filter(Boolean).sort()).toEqual(["scour", "squeeze"]);
  });
  it("no longer uses the reflection coefficient as protection", () => {
    const a = state(), b = state();
    applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 0.5 }), a, "low");
    applyEffect(wall(), SOLUTION_BY_ID.seawall, place("seawall", { crestM: 2.5, frontageShare: 0.5 }), b, "high");
    expect(a.wave).toBe(b.wave);
  });
});

describe("dune as a crest barrier with the FEMA 540 erosion test (audit M3)", () => {
  const e = () => eff("dune", "crest_barrier");
  it("is removed below 50.2 m² and then gives no protection, whatever its crest", () => {
    const s = state({ wlM: 1.0 });
    const steps = applyEffect(e(), SOLUTION_BY_ID.dune, place("dune", { crossSectionM2: 50, crestM: 4, frontageShare: 1 }), s, "central");
    expect(steps[0].flag).toBe("removed");
    expect(s.wave).toBe(1);
  });
  it("survives at ≥ 50.2 m² and then holds below its crest", () => {
    const s = state({ wlM: 2.1 });
    const steps = applyEffect(e(), SOLUTION_BY_ID.dune, place("dune", { crossSectionM2: 51, crestM: 3, frontageShare: 0.8 }), s, "central");
    expect(steps.some((x) => /HELD/.test(x.label))).toBe(true);
    expect(s.wave).toBeCloseTo(0.2, 9);
  });
  it("survives but is overtopped above its crest", () => {
    const s = state({ wlM: 3.2 });
    const steps = applyEffect(e(), SOLUTION_BY_ID.dune, place("dune", { crossSectionM2: 80, crestM: 3, frontageShare: 1 }), s, "central");
    expect(steps.some((x) => x.flag === "overtopped")).toBe(true);
  });
  it("no longer carries the unsourced 35% protectionWhenRetained", () => {
    expect(e().params.protectionWhenRetained).toBeUndefined();
  });
});

describe("breakwater (d'Angremond et al. 1996)", () => {
  it("multiplies the wave indicator by Kt and leaves the water level alone", () => {
    const s = state();
    applyEffect(eff("breakwater", "wave_transmission"), SOLUTION_BY_ID.breakwater, place("breakwater", {}), s, "low");
    expect(s.wave).toBeCloseTo(0.8, 6);
    expect(s.stormM).toBe(1);
  });
});

describe("flood storage (khazan / paddy-field-dam): subtracts volume from the river part", () => {
  it("lowers the river stage in proportion to the volume it holds", () => {
    const s = state({ floodVolumeM3: 60000 });
    applyEffect(eff("tidal_wetland_polder", "flood_storage"), SOLUTION_BY_ID.tidal_wetland_polder, place("tidal_wetland_polder", { areaHa: 20, condition: 1 }), s, "central");
    expect(s.floodVolumeM3).toBe(30000);
    expect(s.riverM).toBeCloseTo(0.5, 6);
    expect(s.stormM).toBe(1);
  });
  it("does nothing in a storm-tide-only event", () => {
    const s = state({ scenario: "surge" });
    applyEffect(eff("tidal_wetland_polder", "flood_storage"), SOLUTION_BY_ID.tidal_wetland_polder, place("tidal_wetland_polder", { areaHa: 20, condition: 1 }), s, "central");
    expect(s.riverM).toBe(1);
  });
  it("check dam breaches when inflow exceeds capacity × breach ratio", () => {
    const s = state({ floodVolumeM3: 40000 });
    const steps = applyEffect(eff("check_dam", "flood_storage_with_breach"), SOLUTION_BY_ID.check_dam, place("check_dam", { capacityM3: 20000 }), s, "central");
    expect(steps[0].flag).toBe("breached");
    expect(s.riverM).toBe(1);
  });
});
