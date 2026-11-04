/**
 * Fixed regression scenario against the Goa case-study data (build spec §7):
 * same inputs → same outputs. If a deliberate model or data change moves these
 * numbers, review the diff and update the snapshot with `npx vitest run -u`.
 *
 * Since the model audit's Phase 2 the pins also cover the impact of the event (damage in ₹, people
 * affected; M12), the expected annual damage and people per year (M13), and the rain-at-high-tide
 * layer with its per-catchment volume balance (M15). The baseline includes Mala's existing drainage.
 */
import { BASELINE_MEASURES, DERIVED, RETURN_PERIODS, modelContext } from "../src/data";
import { defaultExposure, runRisk, runScenario } from "../src/engine/model";
import type { Placement } from "../src/engine/types";

const ctx = modelContext();
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

const round = (x: unknown): unknown =>
  typeof x === "number"
    ? Math.round(x * 1e6) / 1e6
    : Array.isArray(x)
      ? x.map(round)
      : x && typeof x === "object"
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
        : x;

test.each(["surge", "flood", "compound", "rain"] as const)("Goa regression scenario: %s", (sc) => {
  const run = runScenario(ctx, sc, scenario, exp);
  const risk = runRisk((rp) => modelContext({}, rp), RETURN_PERIODS, sc, scenario, exp)!;
  const im = run.impacts;
  expect(
    round({
      totals: run.totals,
      segments: run.segments.map((s) => ({
        id: s.central.segmentId,
        wlM: [s.high.shorelineWlM, s.central.shorelineWlM, s.low.shorelineWlM],
        floodedKm2: [s.high.extent.floodedKm2, s.central.extent.floodedKm2, s.low.extent.floodedKm2],
        bundedKm2: s.central.extent.bundedKm2,
        flags: s.central.flags.map((f) => f.flag)
      })),
      impact: {
        damageInr: [im.high!.damageInr, im.central!.damageInr, im.low!.damageInr],
        peopleAffected: [im.high!.peopleAffected, im.central!.peopleAffected, im.low!.peopleAffected],
        buildingsWet: im.central!.buildingsWet
      },
      risk: { eadInr: [risk.ead.high, risk.ead.central, risk.ead.low], peoplePerYear: [risk.peoplePerYear.high, risk.peoplePerYear.central, risk.peoplePerYear.low] },
      rain: run.rain.central?.map((c) => ({ id: c.id, storedM3: c.storedM3, levelM: Number.isFinite(c.levelM) ? c.levelM : null })) ?? null
    })
  ).toMatchSnapshot();
});
