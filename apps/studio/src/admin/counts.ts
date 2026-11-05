/**
 * Counts shared across admin pages: the numbers in the left nav (Runs, Models, Scenario library pre-run/total,
 * Registry in review, Sign-off queue pending) and the right rail. Set by whoever last fetched a list; refreshCounts()
 * fetches everything again after a mutation.
 */
import { useEffect, useReducer } from "react";
import { api, type RegistryCounts, type RegistryList } from "../api";
import type { LibraryResponse, ModelsList, RunSummary, SignOffList } from "./types";

export interface NavCounts {
  registry: RegistryCounts | null;
  runs: number | null;
  models: number | null;
  /** models whose health is "healthy" */
  models_healthy: number | null;
  library: { pre_run: number; stale: number; missing: number; total: number } | null;
  signoff_pending: number | null;
}

let cached: NavCounts = { registry: null, runs: null, models: null, models_healthy: null, library: null, signoff_pending: null };
const subscribers = new Set<() => void>();

function publish(patch: Partial<NavCounts>): void {
  cached = { ...cached, ...patch };
  for (const s of subscribers) s();
}

export function setCounts(c: RegistryCounts): void {
  publish({ registry: c });
}
export function setRunsCount(n: number): void {
  publish({ runs: n });
}
export function setModelsCounts(m: ModelsList): void {
  publish({ models: m.models.length, models_healthy: m.models.filter((x) => x.health === "healthy").length });
}
export function setLibraryCounts(l: LibraryResponse): void {
  publish({ library: l.counts });
}
export function setSignOffPending(n: number): void {
  publish({ signoff_pending: n });
}

/** Fetch every count again; each request fails on its own without touching the others. */
export async function refreshCounts(): Promise<void> {
  await Promise.all([
    api<RegistryList>("/api/registry").then((r) => setCounts(r.counts)).catch(() => undefined),
    api<{ runs: RunSummary[] }>("/api/runs?place=panjim").then((r) => setRunsCount(r.runs.length)).catch(() => undefined),
    api<ModelsList>("/api/models").then(setModelsCounts).catch(() => undefined),
    api<LibraryResponse>("/api/runs/library").then(setLibraryCounts).catch(() => undefined),
    api<SignOffList>("/api/signoff?status=pending").then((r) => setSignOffPending(r.counts.pending)).catch(() => undefined)
  ]);
}

export function useCounts(): NavCounts {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    subscribers.add(tick);
    return () => {
      subscribers.delete(tick);
    };
  }, []);
  return cached;
}
