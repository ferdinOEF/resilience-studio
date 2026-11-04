/**
 * Dump the regression scenario's pinned values (tests/regression.test.ts) as JSON, so a model change
 * can be logged as an old-vs-new table (docs/model-audit/LOG.md). Run against two checkouts and diff.
 *
 *   npx vite-node tools/regression_dump.ts [out.json] [--no-hazard-bounds] [--p0-storm-level] [--no-bunds]
 *
 * Attribution switches (Phase 1), each re-runs the new model with one change undone:
 *   --no-hazard-bounds  every bound at the central hazard inputs (audit M4)
 *   --p0-storm-level    storm tide = Phase 0's open-coast level, tide 0.6 m + reference surge 1.5 m (audit M5)
 *   --no-bunds          khazan bunds never hold (audit M9)
 * Phase 2 (tools/regression_table_p2.py): the storm, river and compound extents are compared directly with
 * the Phase 1 dump; the impact, risk and rain pins are new, and the dump records them.
 */
import { writeFileSync } from "node:fs";
import { BASELINE_MEASURES, DERIVED, RETURN_PERIODS, modelContext } from "../src/data";
import { defaultExposure, runRisk, runScenario, type HazardValues } from "../src/core/model";
import type { Placement } from "../src/core/types";

const out = process.argv[2] ?? "regression.json";
const over: Partial<HazardValues> = {};
if (process.argv.includes("--p0-storm-level")) over.stormTideM = 0.6 + 1.5;
if (process.argv.includes("--no-bunds")) over.bundCrestM = -1e9;
const ctx = modelContext(over);
if (process.argv.includes("--no-hazard-bounds")) (ctx as { hazardAt?: unknown }).hazardAt = undefined;
const exp = Object.fromEntries(DERIVED.segments.map((s) => [s.id, defaultExposure(s)]));
const scenario: Placement[] = [
  ...BASELINE_MEASURES,
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
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const res: Record<string, unknown> = {};
for (const sc of ["surge", "flood", "compound", "rain"] as const) {
  const run = runScenario(ctx, sc, scenario, exp);
  const risk = runRisk((rp) => modelContext(over, rp), RETURN_PERIODS, sc, scenario, exp)!;
  const im = run.impacts;
  res[sc] = {
    totals: Object.fromEntries(Object.entries(run.totals).map(([k, v]) => [k, v ? { low: r6(v.low), central: r6(v.central), high: r6(v.high) } : null])),
    segments: run.segments.map((s) => ({
      id: s.central.segmentId,
      wlM: [r6(s.high.shorelineWlM), r6(s.central.shorelineWlM), r6(s.low.shorelineWlM)],
      floodedKm2: [r6(s.high.extent.floodedKm2), r6(s.central.extent.floodedKm2), r6(s.low.extent.floodedKm2)],
      bundedKm2: r6(s.central.extent.bundedKm2),
      flags: s.central.flags.map((f) => f.flag)
    })),
    impact: {
      damageInr: [r6(im.high!.damageInr), r6(im.central!.damageInr), r6(im.low!.damageInr)],
      peopleAffected: [r6(im.high!.peopleAffected), r6(im.central!.peopleAffected), r6(im.low!.peopleAffected)],
      buildingsWet: r6(im.central!.buildingsWet)
    },
    risk: { eadInr: [r6(risk.ead.high), r6(risk.ead.central), r6(risk.ead.low)], peoplePerYear: [r6(risk.peoplePerYear.high), r6(risk.peoplePerYear.central), r6(risk.peoplePerYear.low)] },
    rain: run.rain.central?.map((c) => ({ id: c.id, storedM3: r6(c.storedM3), levelM: Number.isFinite(c.levelM) ? r6(c.levelM) : null })) ?? null
  };
}
writeFileSync(out, JSON.stringify(res, null, 2));
console.log("wrote", out);
