/**
 * Stale detection (spec section 3.2): a scenario or run records the registry version ids it used; once any of them
 * is superseded by a newer approved version, the scenario is stale and hidden from the studio until re-run.
 */
import { groupById } from "./resolve";
import type { RegistryEntry } from "./schema";

export interface UsedVersion {
  id: string;
  version_id: string;
}

export interface StaleReport {
  stale: boolean;
  /** entries whose used version is no longer the current one */
  changed: { id: string; used: string; current: string | null; reason: "superseded" | "withdrawn" }[];
}

export function staleness(used: UsedVersion[], all: RegistryEntry[]): StaleReport {
  const byId = groupById(all);
  const changed: StaleReport["changed"] = [];
  for (const u of used) {
    const rows = byId.get(u.id) ?? [];
    const usedRow = rows.find((r) => r.version_id === u.version_id);
    const current = rows.filter((r) => r.status === "approved").sort((a, b) => b.version - a.version)[0] ?? null;
    if (!usedRow) {
      changed.push({ id: u.id, used: u.version_id, current: current?.version_id ?? null, reason: "withdrawn" });
      continue;
    }
    if (usedRow.status === "superseded" || (current && current.version_id !== u.version_id && usedRow.status !== "approved")) {
      changed.push({ id: u.id, used: u.version_id, current: current?.version_id ?? null, reason: "superseded" });
    }
  }
  return { stale: changed.length > 0, changed };
}
