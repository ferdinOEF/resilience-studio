/**
 * Scenario library schema (spec section 1.4): hazard x return period x year x pathway x solution set. Phase 1 ships the
 * schema and the index over runs; the heavy pre-computation worker comes in Phase 3.
 */
import type { ReturnPeriod, ScenarioId } from "@resilience/core";
import type { RunRecord, ScenarioSpec } from "./types";

export interface LibraryDimensions {
  hazards: ScenarioId[];
  return_periods: ReturnPeriod[];
  horizons: ScenarioSpec["horizon"][];
  pathways: ScenarioSpec["pathway"][];
  solution_sets: string[];
}

export const PANJIM_LIBRARY: LibraryDimensions = {
  hazards: ["surge", "flood", "compound", "rain"],
  return_periods: [1, 10, 50, 100],
  horizons: ["today", "2050", "2100"],
  pathways: ["ssp126", "ssp245", "ssp585"],
  solution_sets: ["do-nothing"]
};

export function libraryKey(s: ScenarioSpec): string {
  return `${s.place}:${s.hazard}:${s.return_periods.join("-")}:${s.horizon}:${s.pathway}:${s.solution_set.id}${s.bunds_failed ? ":bunds-failed" : ""}`;
}

export interface LibraryCell {
  key: string;
  hazard: ScenarioId;
  horizon: ScenarioSpec["horizon"];
  pathway: ScenarioSpec["pathway"];
  solution_set: string;
  run_id: string | null;
  status: "pre-run" | "stale" | "missing";
  chain_signed_off: boolean;
}

/** Coverage of the library by the runs that exist (a run covers all its return periods at once). */
export function libraryCoverage(place: string, dims: LibraryDimensions, runs: RunRecord[]): { cells: LibraryCell[]; counts: { total: number; pre_run: number; stale: number; missing: number } } {
  const cells: LibraryCell[] = [];
  for (const hazard of dims.hazards) for (const horizon of dims.horizons) for (const pathway of horizon === "today" ? [dims.pathways[1] ?? dims.pathways[0]] : dims.pathways) for (const solution_set of dims.solution_sets) {
    const match = runs.filter((r) => r.status === "ok" && r.plan.scenario.place === place && r.plan.scenario.hazard === hazard && r.plan.scenario.horizon === horizon && r.plan.scenario.pathway === pathway && r.plan.scenario.solution_set.id === solution_set && !r.plan.scenario.bunds_failed).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const run = match[0] ?? null;
    cells.push({
      key: `${place}:${hazard}:${horizon}:${pathway}:${solution_set}`,
      hazard, horizon, pathway, solution_set,
      run_id: run?.id ?? null,
      status: run ? (run.stale ? "stale" : "pre-run") : "missing",
      chain_signed_off: run?.chain_signed_off ?? false
    });
  }
  return { cells, counts: { total: cells.length, pre_run: cells.filter((c) => c.status === "pre-run").length, stale: cells.filter((c) => c.status === "stale").length, missing: cells.filter((c) => c.status === "missing").length } };
}
