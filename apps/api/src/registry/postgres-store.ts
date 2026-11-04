/** Postgres implementation of the registry store: one row per version in registry_entries. */
import type { RegistryEntry, RegistryStore } from "@resilience/registry";
import { EntrySchema } from "@resilience/registry";
import { sql } from "../db";

type Row = Record<string, unknown>;

function fromRow(r: Row): RegistryEntry {
  const e = {
    ...r,
    created_at: new Date(r.created_at as string).toISOString(),
    approved_at: r.approved_at ? new Date(r.approved_at as string).toISOString() : null,
    used_by: (r.used_by as string[]) ?? []
  };
  return EntrySchema.parse(e);
}

export class PostgresStore implements RegistryStore {
  async all(): Promise<RegistryEntry[]> {
    const rows = await sql()`select * from registry_entries order by id, version`;
    return (rows as Row[]).map(fromRow);
  }
  async versions(id: string): Promise<RegistryEntry[]> {
    const rows = await sql()`select * from registry_entries where id = ${id} order by version`;
    return (rows as Row[]).map(fromRow);
  }
  async get(versionId: string): Promise<RegistryEntry | null> {
    const rows = await sql()`select * from registry_entries where version_id = ${versionId}`;
    return rows.length ? fromRow(rows[0] as Row) : null;
  }
  async insert(e: RegistryEntry): Promise<void> {
    await sql()`insert into registry_entries (version_id, id, version, kind, label, value, unit, valid_range, level, geography, source, grounding, note, author, reviewer, review_note, status, created_at, approved_at, supersedes, change_reason, used_by)
      values (${e.version_id}, ${e.id}, ${e.version}, ${e.kind}, ${e.label}, ${JSON.stringify(e.value)}::jsonb, ${e.unit}, ${e.valid_range ? JSON.stringify(e.valid_range) : null}::jsonb, ${e.level}, ${e.geography}, ${JSON.stringify(e.source)}::jsonb, ${e.grounding}, ${e.note}, ${e.author}, ${e.reviewer}, ${e.review_note}, ${e.status}, ${e.created_at}, ${e.approved_at}, ${e.supersedes}, ${e.change_reason}, ${e.used_by})`;
  }
  async update(rows: RegistryEntry[]): Promise<void> {
    for (const e of rows) {
      const res = await sql()`update registry_entries set status = ${e.status}, reviewer = ${e.reviewer}, review_note = ${e.review_note}, approved_at = ${e.approved_at}, used_by = ${e.used_by} where version_id = ${e.version_id} returning version_id`;
      if (!res.length) throw new Error(`${e.version_id} not found`);
    }
  }
  async count(): Promise<number> {
    const rows = await sql()`select count(*)::int as n from registry_entries`;
    return (rows[0] as { n: number }).n;
  }
  async insertMany(entries: RegistryEntry[]): Promise<void> {
    for (const e of entries) await this.insert(e);
  }
}
