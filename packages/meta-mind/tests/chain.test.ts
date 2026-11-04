import { describe, expect, it } from "vitest";
import { PORTED_CHAIN_CONTRACTS } from "@resilience/contracts";
import { RETURN_PERIODS, type Placement } from "@resilience/core";
import { buildSeed, MemoryStore, PANJIM, RegistryService, resolveAll } from "@resilience/registry";
import { AUDIT_FORMAT, DeterministicLiaison, exportAudit, libraryCoverage, markStale, MemorySignOffStore, PANJIM_LIBRARY, portedChainAgents, SignOffQueue, StubMetaMind, type ScenarioSpec } from "../src";

/** The regression scenario of packages/core/tests/regression.test.ts, so the chain can be checked against the pinned engine values. */
const REGRESSION_PLACEMENTS: Placement[] = [
  { id: "r1", solutionId: "mangrove", segmentId: "panjim_riverfront", params: { widthM: 150, maturity: 0.6 } },
  { id: "r2", solutionId: "seawall", segmentId: "miramar_caranzalem", params: { crestM: 2.5, frontageShare: 1 } },
  { id: "r3", solutionId: "dune", segmentId: "miramar_caranzalem", params: { crossSectionM2: 60 } },
  { id: "r4", solutionId: "breakwater", segmentId: "dona_paula", params: {} },
  { id: "r5", solutionId: "check_dam", segmentId: "st_inez_ribandar", params: { capacityM3: 50000 } },
  { id: "r6", solutionId: "tidal_wetland_polder", segmentId: "panjim_riverfront", params: { areaHa: 15, condition: 0.8 } },
  { id: "r7", solutionId: "coastal_vegetation", segmentId: "miramar_caranzalem", params: { widthM: 40, maturity: 1 } },
  { id: "r8", solutionId: "retention_basin", segmentId: "panjim_riverfront", params: { volumeM3: 50000, catchment: 0 } },
  { id: "r9", solutionId: "flap_gate", segmentId: "panjim_riverfront", params: { catchment: 1 } }
];

const seedRows = buildSeed().entries;
const resolvedAdmin = resolveAll(seedRows, PANJIM, { allowUnapproved: true });

function liaison(resolved = resolvedAdmin, contracts = PORTED_CHAIN_CONTRACTS) {
  return new DeterministicLiaison({ agents: portedChainAgents(resolved), contracts, resolved });
}

describe("the ported chain through the Liaison", () => {
  const scenario: ScenarioSpec = { place: "panjim", hazard: "compound", return_periods: RETURN_PERIODS, horizon: "today", pathway: "ssp245", solution_set: { id: "regression", label: "regression scenario", placements: REGRESSION_PLACEMENTS } };
  const mm = new StubMetaMind();
  const plan = mm.plan("regression check: compound flood, today, regression solution set", scenario);

  it("runs end to end with every hand-off validated and reproduces the engine's pinned values", async () => {
    const run = await liaison().execute(plan, "test");
    if (run.status !== "ok") console.log(run.error, run.log.slice(-5));
    expect(run.status).toBe("ok");
    expect(run.steps.length).toBe(RETURN_PERIODS.length * 3 * 3 + 3);
    expect(run.handoffs.every((h) => h.ok)).toBe(true);
    expect(run.handoffs.filter((h) => h.step > 0).length).toBeGreaterThan(0);
    // the pinned regression values (packages/core/tests/__snapshots__/regression.test.ts.snap, compound layer)
    const r = run.result!;
    expect(r.totals.damage_inr.central).toBeCloseTo(3546746786.879244, 0);
    expect(r.totals.people_affected.central).toBeCloseTo(4868.653914, 3);
    expect(r.totals.buildings_wet.central).toBe(1496);
    expect(r.annual!.ead_inr.central).toBeCloseTo(1288342475.559393, 0);
    expect(r.annual!.people_per_year.central).toBeCloseTo(1827.360784, 3);
    expect(r.annual!.ead_inr.low).toBeCloseTo(7969230934.587576, 0);
    expect(r.per_segment.find((s) => s.id === "st_inez_ribandar")!.flooded_km2.central).toBeCloseTo(2.16445, 5);
    expect(r.per_segment.find((s) => s.id === "miramar_caranzalem")!.flags).toContain("scour");
    // audit trail
    expect(run.registry_versions.length).toBeGreaterThan(40);
    expect(run.registry_versions.every((v) => v.version_id.endsWith("@1") && v.status === "in_review")).toBe(true);
    expect(run.chain_signed_off).toBe(false);
    const audit = exportAudit(run, seedRows);
    expect(audit.format).toBe(AUDIT_FORMAT);
    expect(audit.registry_entries.length).toBe(run.registry_versions.length);
    expect(audit.run.log.some((l) => l.who === "validator")).toBe(true);
    // the Meta Mind reads references, never numbers of its own
    const outlay = mm.read(run);
    expect(outlay.references.map((x) => x.path)).toContain("result.annual.ead_inr.central");
    expect(outlay.proposals).toEqual([]);
  }, 180000);

  it("refuses a plan with a hand-off outside the contracts before anything runs", async () => {
    const bad = { ...plan, handoffs: [...plan.handoffs, { from_model: "water-level", output: "water_level", to_model: "damage", input: "depth" }] };
    const run = await liaison().execute(bad, "test");
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/plan rejected by the contract validator/);
    expect(run.steps).toEqual([]);
  });

  it("goes stale when a registry value it used is superseded, and reads an approved edit on the next run", async () => {
    const svc = new RegistryService(new MemoryStore(seedRows));
    const store = (svc as unknown as { store: MemoryStore }).store;
    // a river flood: MHHW enters its water level directly (in a storm scenario the storm tide already contains the tide)
    const quick: ScenarioSpec = { ...scenario, hazard: "flood", return_periods: [100], solution_set: { id: "do-nothing", label: "do nothing", placements: [] } };
    const before = await liaison(resolveAll(await store.all(), PANJIM, { allowUnapproved: true })).execute(new StubMetaMind().plan("q", quick), "test");
    expect(before.status).toBe("ok");
    const usedTide = before.registry_versions.find((v) => v.id === "hazards.params.highTideReferenceM")!;
    expect(usedTide.version_id).toBe("hazards.params.highTideReferenceM@1");
    expect(markStale(before, await store.all()).stale).toBe(false);
    // an approved edit of MHHW: +0.4 m
    const v1 = (await store.versions("hazards.params.highTideReferenceM"))[0];
    const v2 = await svc.propose({ ...v1, value: { type: "scalar", value: 1.0, low: 1.0, high: 1.4 }, change_reason: "test: higher tide" }, "alice");
    await svc.submit(v2.version_id);
    await svc.approve(v2.version_id, "bob");
    const rows = await store.all();
    expect(markStale(before, rows).stale).toBe(true);
    const after = await liaison(resolveAll(rows, PANJIM, { allowUnapproved: true })).execute(new StubMetaMind().plan("q", quick), "test");
    expect(after.registry_versions.find((v) => v.id === "hazards.params.highTideReferenceM")!.version_id).toBe(v2.version_id);
    // every segment's shoreline level rises by the edit (0.4 m)
    for (const seg of after.result!.per_segment) {
      const was = before.result!.per_segment.find((s) => s.id === seg.id)!;
      expect(seg.shoreline_wl_m.central - was.shoreline_wl_m.central).toBeCloseTo(0.4, 6);
    }
    expect(after.result!.totals.flooded_km2.central).not.toBe(before.result!.totals.flooded_km2.central);
  }, 180000);
});

describe("framework rules", () => {
  it("the Meta Mind requests variants, never edits; the sign-off queue enforces the two-person rule", async () => {
    const mm = new StubMetaMind();
    const base: ScenarioSpec = { place: "panjim", hazard: "surge", return_periods: [100], horizon: "today", pathway: "ssp245", solution_set: { id: "do-nothing", label: "do nothing", placements: [] } };
    const v = mm.requestVariant(base, [{ registry_id: "hazards.params.bundCrestM", from: 1.5, to: 1.0 }], "stress test: lower bund crest");
    expect(v.requested_by).toBe("meta-mind");
    expect(mm.log.at(-1)!.message).toContain("variant");
    expect(() => mm.requestVariant(base, [], "no changes")).toThrow();
    const q = new SignOffQueue(new MemorySignOffStore());
    const item = await q.propose({ kind: "registry_edit", title: "Lower bund crest", reasoning: "sensitivity shows the crest dominates", payload: { version_id: "hazards.params.bundCrestM@2" }, proposed_by: "meta-mind" });
    await expect(q.decide(item.id, "approved", "meta-mind")).rejects.toMatchObject({ code: "two_person" });
    await expect(q.decide(item.id, "rejected", "bob")).rejects.toMatchObject({ code: "invalid" });
    const done = await q.decide(item.id, "approved", "bob", "ok");
    expect(done.status).toBe("approved");
    await expect(q.decide(item.id, "rejected", "carol", "late")).rejects.toMatchObject({ code: "bad_state" });
  });
  it("indexes the scenario library coverage", () => {
    const cov = libraryCoverage("panjim", PANJIM_LIBRARY, []);
    expect(cov.counts.total).toBe(4 * (1 + 2 * 3) * 1);
    expect(cov.counts.missing).toBe(cov.counts.total);
  });
});
