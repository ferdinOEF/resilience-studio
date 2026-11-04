/**
 * Postgres stores for runs, the sign-off queue and model status, plus the in-memory fallbacks used without a database.
 */
import type { ModelContract } from "@resilience/contracts";
import { MemoryRunStore, MemorySignOffStore, type RunRecord, type RunStore, type SignOffItem, type SignOffStore } from "@resilience/meta-mind";
import { hasDatabase, sql } from "../db";

export class PostgresRunStore implements RunStore {
  async insert(run: RunRecord) {
    await sql()`insert into runs (id, created_at, requested_by, place, hazard, status, stale, chain_signed_off, duration_ms, record)
      values (${run.id}, ${run.created_at}, ${run.requested_by}, ${run.plan.scenario.place}, ${run.plan.scenario.hazard}, ${run.status}, ${run.stale}, ${run.chain_signed_off}, ${run.duration_ms}, ${JSON.stringify(run)}::jsonb)`;
  }
  async update(run: RunRecord) {
    await sql()`update runs set status = ${run.status}, stale = ${run.stale}, chain_signed_off = ${run.chain_signed_off}, duration_ms = ${run.duration_ms}, record = ${JSON.stringify(run)}::jsonb where id = ${run.id}`;
  }
  async get(id: string) {
    const rows = await sql()`select record from runs where id = ${id}`;
    return rows.length ? ((rows[0] as { record: RunRecord }).record) : null;
  }
  async list(opts: { place?: string; limit?: number } = {}) {
    const limit = opts.limit ?? 200;
    const rows = opts.place
      ? await sql()`select record from runs where place = ${opts.place} order by created_at desc limit ${limit}`
      : await sql()`select record from runs order by created_at desc limit ${limit}`;
    return (rows as { record: RunRecord }[]).map((r) => r.record);
  }
}

export class PostgresSignOffStore implements SignOffStore {
  async insert(i: SignOffItem) {
    await sql()`insert into signoff_items (id, kind, title, reasoning, payload, proposed_by, status, created_at, decided_by, decided_at, decision_note)
      values (${i.id}, ${i.kind}, ${i.title}, ${i.reasoning}, ${JSON.stringify(i.payload)}::jsonb, ${i.proposed_by}, ${i.status}, ${i.created_at}, ${i.decided_by}, ${i.decided_at}, ${i.decision_note})`;
  }
  async update(i: SignOffItem) {
    await sql()`update signoff_items set status = ${i.status}, decided_by = ${i.decided_by}, decided_at = ${i.decided_at}, decision_note = ${i.decision_note} where id = ${i.id}`;
  }
  async get(id: string) {
    const rows = await sql()`select * from signoff_items where id = ${id}`;
    return rows.length ? fromSignOffRow(rows[0] as Record<string, unknown>) : null;
  }
  async list(status?: SignOffItem["status"]) {
    const rows = status ? await sql()`select * from signoff_items where status = ${status} order by created_at desc` : await sql()`select * from signoff_items order by created_at desc`;
    return (rows as Record<string, unknown>[]).map(fromSignOffRow);
  }
}

function fromSignOffRow(r: Record<string, unknown>): SignOffItem {
  return {
    id: r.id as string, kind: r.kind as SignOffItem["kind"], title: r.title as string, reasoning: r.reasoning as string, payload: r.payload as Record<string, unknown>,
    proposed_by: r.proposed_by as string, status: r.status as SignOffItem["status"], created_at: new Date(r.created_at as string).toISOString(),
    decided_by: (r.decided_by as string) ?? null, decided_at: r.decided_at ? new Date(r.decided_at as string).toISOString() : null, decision_note: (r.decision_note as string) ?? null
  };
}

export interface ModelStatusRow {
  model_id: string;
  calibration_status: ModelContract["calibration"]["status"];
  events: ModelContract["calibration"]["events"];
  signed_off_by: string | null;
  signed_off_at: string | null;
  updated_by: string | null;
}

export interface ModelStatusStore {
  all(): Promise<ModelStatusRow[]>;
  set(row: ModelStatusRow): Promise<void>;
}

export class MemoryModelStatusStore implements ModelStatusStore {
  private rows = new Map<string, ModelStatusRow>();
  async all() {
    return [...this.rows.values()];
  }
  async set(row: ModelStatusRow) {
    this.rows.set(row.model_id, row);
  }
}

export class PostgresModelStatusStore implements ModelStatusStore {
  async all() {
    const rows = await sql()`select model_id, calibration_status, events, signed_off_by, signed_off_at, updated_by from model_status`;
    return (rows as Record<string, unknown>[]).map((r) => ({ model_id: r.model_id as string, calibration_status: r.calibration_status as ModelStatusRow["calibration_status"], events: (r.events as ModelStatusRow["events"]) ?? [], signed_off_by: (r.signed_off_by as string) ?? null, signed_off_at: r.signed_off_at ? new Date(r.signed_off_at as string).toISOString() : null, updated_by: (r.updated_by as string) ?? null }));
  }
  async set(row: ModelStatusRow) {
    await sql()`insert into model_status (model_id, calibration_status, events, signed_off_by, signed_off_at, updated_at, updated_by)
      values (${row.model_id}, ${row.calibration_status}, ${JSON.stringify(row.events)}::jsonb, ${row.signed_off_by}, ${row.signed_off_at}, now(), ${row.updated_by})
      on conflict (model_id) do update set calibration_status = excluded.calibration_status, events = excluded.events, signed_off_by = excluded.signed_off_by, signed_off_at = excluded.signed_off_at, updated_at = now(), updated_by = excluded.updated_by`;
  }
}

/* ---------------------------------------------------------------- selection */

const memory = { runs: new MemoryRunStore(), signoff: new MemorySignOffStore(), models: new MemoryModelStatusStore() };

export function runStore(): RunStore {
  return hasDatabase() ? new PostgresRunStore() : memory.runs;
}
export function signOffStore(): SignOffStore {
  return hasDatabase() ? new PostgresSignOffStore() : memory.signoff;
}
export function modelStatusStore(): ModelStatusStore {
  return hasDatabase() ? new PostgresModelStatusStore() : memory.models;
}

/** Contracts as they stand: the code's defaults with the admin's calibration status applied. */
export async function currentContracts(contracts: ModelContract[]): Promise<ModelContract[]> {
  const rows = await modelStatusStore().all();
  const byId = new Map(rows.map((r) => [r.model_id, r]));
  return contracts.map((c) => {
    const s = byId.get(c.id);
    return s ? { ...c, calibration: { status: s.calibration_status, events: s.events, signed_off_by: s.signed_off_by, signed_off_at: s.signed_off_at } } : c;
  });
}
