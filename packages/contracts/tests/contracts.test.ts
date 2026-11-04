import { describe, expect, it } from "vitest";
import { checkValues, DAMAGE, expandDependencies, gateStatus, LOSS, ModelContractSchema, modelContractJsonSchema, PEOPLE, PORTED_CHAIN_CONTRACTS, PORTED_CHAIN_HANDOFFS, validateChain, validateHandoff, WATER_LEVEL } from "../src";

describe("contract schema", () => {
  it("accepts the four ported contracts and exports a JSON schema", () => {
    for (const c of PORTED_CHAIN_CONTRACTS) expect(ModelContractSchema.safeParse(c).success).toBe(true);
    const js = modelContractJsonSchema();
    expect(js).toHaveProperty("properties.inputs");
  });
  it("rejects a contract without a calibration status or with a bad id", () => {
    const bad = { ...WATER_LEVEL, id: "Water Level" };
    expect(ModelContractSchema.safeParse(bad).success).toBe(false);
    const { calibration: _c, ...noCal } = WATER_LEVEL;
    expect(ModelContractSchema.safeParse(noCal).success).toBe(false);
  });
});

describe("hand-off validator on the ported chain", () => {
  it("passes every declared hand-off of water level -> damage -> people -> loss", () => {
    const r = validateChain(PORTED_CHAIN_CONTRACTS, PORTED_CHAIN_HANDOFFS);
    if (!r.ok) console.log(JSON.stringify(r.checks.filter((c) => !c.ok), null, 2));
    expect(r.ok).toBe(true);
    expect(r.checks).toHaveLength(6);
  });
  it("rejects a deliberately mismatched hand-off: water level above MSL fed as depth", () => {
    const r = validateHandoff(WATER_LEVEL, DAMAGE, { from_model: "water-level", output: "water_level", to_model: "damage", input: "depth" });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining(["no_route", "quantity", "range"]));
  });
  it("rejects a unit mismatch without a declared conversion, and accepts it with one", () => {
    const cmModel = { ...WATER_LEVEL, id: "water-level-cm", outputs: WATER_LEVEL.outputs.map((o) => (o.name === "depth" ? { ...o, unit: "cm", valid_range: [0, 1000] as [number, number] } : o)), routing: WATER_LEVEL.routing.map((r) => ({ ...r })) };
    const without = validateHandoff(cmModel, DAMAGE, { from_model: "water-level-cm", output: "depth", to_model: "damage", input: "depth" });
    expect(without.ok).toBe(false);
    expect(without.errors.map((e) => e.code)).toContain("unit");
    const withConv = validateHandoff(cmModel, DAMAGE, { from_model: "water-level-cm", output: "depth", to_model: "damage", input: "depth", transform: { unit_conversion: { from: "cm", to: "m", factor: 0.01 } } });
    expect(withConv.errors.map((e) => e.code)).not.toContain("unit");
    expect(withConv.errors.map((e) => e.code)).not.toContain("range");
  });
  it("rejects a grid mismatch without a regrid method, and a CRS mismatch without a reprojection", () => {
    const coarse = { ...PEOPLE, inputs: PEOPLE.inputs.map((i) => (i.name === "depth" ? { ...i, grid: { ...i.grid, resolution_m: 100 } } : i)) };
    const g = validateHandoff(WATER_LEVEL, coarse, { from_model: "water-level", output: "depth", to_model: "people", input: "depth" });
    expect(g.errors.map((e) => e.code)).toContain("grid");
    const ok = validateHandoff(WATER_LEVEL, coarse, { from_model: "water-level", output: "depth", to_model: "people", input: "depth", transform: { regrid: "aggregate_max" } });
    expect(ok.errors.map((e) => e.code)).not.toContain("grid");
    const utm = { ...PEOPLE, inputs: PEOPLE.inputs.map((i) => (i.name === "depth" ? { ...i, crs: "EPSG:32643" } : i)) };
    expect(validateHandoff(WATER_LEVEL, utm, { from_model: "water-level", output: "depth", to_model: "people", input: "depth" }).errors.map((e) => e.code)).toContain("crs");
  });
  it("rejects an undeclared route even when the ports match", () => {
    const r = validateHandoff(DAMAGE, LOSS, { from_model: "damage", output: "damage_by_segment", to_model: "loss", input: "damage_by_return_period" });
    expect(r.errors.map((e) => e.code)).toContain("no_route");
  });
});

describe("run-time value checks and the sign-off gate", () => {
  it("flags values outside a port's range", () => {
    const depth = WATER_LEVEL.outputs.find((o) => o.name === "depth")!;
    expect(checkValues(depth, [0, 0.5, 2.1]).ok).toBe(true);
    expect(checkValues(depth, [0, 12]).ok).toBe(false);
    expect(checkValues(depth, [-0.2, 1]).ok).toBe(false);
  });
  it("expands wildcard dependencies and gates sign-off on approval of every one", () => {
    const ids = ["hazards.params.a", "hazards.params.b", "damage.curves.x", "datasets.dem", "datasets.crzGrid", "defenses", "solutions.s.p", "areas.panjim_mandovi_pilot.population.total"];
    expect(expandDependencies(["hazards.*"], ids)).toEqual(["hazards.params.a", "hazards.params.b"]);
    const g = gateStatus(WATER_LEVEL, new Set(ids), ids);
    expect(g.unapproved).toEqual([]);
    expect(g.signed_off).toBe(false); // calibration is still uncalibrated
    const signed = { ...WATER_LEVEL, calibration: { ...WATER_LEVEL.calibration, status: "signed_off" as const } };
    expect(gateStatus(signed, new Set(ids), ids).signed_off).toBe(true);
    expect(gateStatus(signed, new Set(ids.slice(1)), ids).signed_off).toBe(false);
    expect(gateStatus(signed, new Set(ids.slice(1)), ids).unapproved).toEqual(["hazards.params.a"]);
  });
});
