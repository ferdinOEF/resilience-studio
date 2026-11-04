/**
 * The run log (spec rule 4: everything traced). A run record is the audit trail: plan, contracts, registry versions,
 * steps, hand-offs, agent log, result. The store keeps it; the export wraps it with a format tag so it can be
 * reconstructed outside the studio.
 */
import type { RegistryEntry } from "@resilience/registry";
import { staleness } from "@resilience/registry";
import type { LogEntry, RunRecord, Tier } from "./types";

export interface RunStore {
  insert(run: RunRecord): Promise<void>;
  update(run: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  list(opts?: { place?: string; limit?: number }): Promise<RunRecord[]>;
}

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, RunRecord>();
  async insert(run: RunRecord) {
    this.runs.set(run.id, run);
  }
  async update(run: RunRecord) {
    if (!this.runs.has(run.id)) throw new Error(`run ${run.id} not found`);
    this.runs.set(run.id, run);
  }
  async get(id: string) {
    return this.runs.get(id) ?? null;
  }
  async list(opts: { place?: string; limit?: number } = {}) {
    const all = [...this.runs.values()].filter((r) => !opts.place || r.plan.scenario.place === opts.place).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return opts.limit ? all.slice(0, opts.limit) : all;
  }
}

export function newId(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

export function logEntry(who: Tier | string, message: string, data?: Record<string, unknown>): LogEntry {
  return { t: new Date().toISOString(), who, message, ...(data ? { data } : {}) };
}

export const AUDIT_FORMAT = "resilience-studio-audit/1";

/** The exportable audit trail of a run: the record itself plus how to read it. */
export function exportAudit(run: RunRecord, registryRows: RegistryEntry[] = []) {
  const usedIds = new Set(run.registry_versions.map((v) => v.version_id));
  return {
    format: AUDIT_FORMAT,
    exported_at: new Date().toISOString(),
    how_to_read: [
      "plan: what the Meta Mind asked for and the chain it planned, before anything ran",
      "contracts: each model's contract version and calibration status at run time",
      "registry_versions: every registry entry version the chain read, with the level used (local overrides national)",
      "steps: each model run with attempts, timings, output digests and anomalies reported by the model agent",
      "handoffs: each hand-off with the validator's verdict and the Liaison's value check",
      "log: the agents' activity in order",
      "result: the numbers the models produced; the Meta Mind produced none"
    ],
    run,
    registry_entries: registryRows.filter((r) => usedIds.has(r.version_id))
  };
}

/** Re-check a run against the registry: stale once any version it used is superseded. */
export function markStale(run: RunRecord, registryRows: RegistryEntry[]): RunRecord {
  const rep = staleness(run.registry_versions.map((v) => ({ id: v.id, version_id: v.version_id })), registryRows);
  return rep.stale === run.stale ? run : { ...run, stale: rep.stale, log: [...run.log, logEntry("framework", rep.stale ? `run marked stale: ${rep.changed.map((c) => `${c.used} -> ${c.current ?? "withdrawn"}`).join(", ")}` : "run no longer stale")] };
}
