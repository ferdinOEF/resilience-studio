import { describe, expect, it } from "vitest";
import { PORTED_CHAIN_CONTRACTS } from "@resilience/contracts";
import { DeterministicLiaison, portedChainAgents, StubMetaMind, type ScenarioSpec } from "@resilience/meta-mind";
import { getLayer } from "@resilience/places";
import { buildSeed, PANJIM, resolveAll } from "@resilience/registry";
import { crzClassesGeoJSON, extentGeoJSON, zoneStats } from "../src/studio/geometry";

const resolved = resolveAll(buildSeed().entries, PANJIM, { allowUnapproved: true });
const scenario: ScenarioSpec = { place: "panjim", hazard: "compound", return_periods: [100], horizon: "today", pathway: "ssp245", solution_set: { id: "do-nothing", label: "do nothing", placements: [] } };

describe("studio geometry", () => {
  it("vectorises a run's extent by depth band and aggregates it over the placeholder zones", async () => {
    const run = await new DeterministicLiaison({ agents: portedChainAgents(resolved), contracts: PORTED_CHAIN_CONTRACTS, resolved, keepCells: true }).execute(new StubMetaMind().plan("q", scenario), "test");
    expect(run.status).toBe("ok");
    const ext = extentGeoJSON(run);
    expect(ext.features.length).toBeGreaterThan(10);
    const bands = new Set(ext.features.map((f) => f.properties!.band));
    expect([...bands].sort()).toEqual([1, 2]);
    for (const f of ext.features) {
      const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const [x, y] of ring) { expect(x).toBeGreaterThan(73.7); expect(x).toBeLessThan(73.95); expect(y).toBeGreaterThan(15.4); expect(y).toBeLessThan(15.6); }
    }
    const zones = getLayer("panjim", "ward_zones")!.data as Parameters<typeof zoneStats>[1];
    const z = zoneStats(run, zones);
    expect(z.zones).toHaveLength(9);
    expect(z.zones[0].rank).toBe(1);
    expect(z.zones.every((x) => x.people_total >= x.people_in_flood)).toBe(true);
    expect(z.zones.map((x) => x.rank_class)).toEqual(expect.arrayContaining([4, 1]));
    expect(z.method).toMatch(/rank/);
  });
  it("vectorises the CRZ classes", () => {
    const crz = crzClassesGeoJSON();
    const classes = new Set(crz.features.map((f) => f.properties!.crz_class));
    expect(classes.has("M")).toBe(true);
    expect(classes.has("U")).toBe(true);
    expect(crz.features.length).toBeGreaterThan(50);
  });
});
