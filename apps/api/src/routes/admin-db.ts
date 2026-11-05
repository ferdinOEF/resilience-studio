/**
 * Database bootstrap from the admin side: apply the SQL migrations and the registry seed over the Neon HTTP driver, so
 * no connection string has to leave Vercel. Admin role only; idempotent (migrations are recorded, the seed skips rows
 * that exist). Equivalent to `pnpm --filter @resilience/api db:migrate` and `db:seed`.
 */
import { Hono } from "hono";
import { buildSeed } from "@resilience/registry";
import { requireUser } from "../auth";
import { hasDatabase, sql } from "../db";
import { PostgresStore } from "../registry/postgres-store";
import { MIGRATIONS } from "../migrations";

export const adminDb = new Hono();

adminDb.get("/status", requireUser("read_admin"), async (c) => {
  if (!hasDatabase()) return c.json({ database: false });
  const applied = (await sql()`select name, applied_at from schema_migrations order by name`.catch(() => [])) as { name: string; applied_at: string }[];
  const count = (await sql()`select count(*)::int as n from registry_entries`.catch(() => [{ n: null }]))[0] as { n: number | null };
  return c.json({ database: true, migrations: { available: MIGRATIONS.map((m) => m.name), applied: applied.map((a) => a.name) }, registry_rows: count.n });
});

/** Apply pending migrations in order. Each file runs statement by statement over HTTP (no multi-statement transaction on this driver). */
adminDb.post("/migrate", requireUser("manage_users"), async (c) => {
  if (!hasDatabase()) return c.json({ error: "DATABASE_URL is not set on this deployment", code: "no_database" }, 503);
  await sql()`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set(((await sql()`select name from schema_migrations`) as { name: string }[]).map((r) => r.name));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    for (const statement of splitStatements(m.sql)) await sql().query(statement);
    await sql()`insert into schema_migrations (name) values (${m.name})`;
    applied.push(m.name);
  }
  return c.json({ applied, skipped: [...done] });
});

adminDb.post("/seed", requireUser("manage_users"), async (c) => {
  if (!hasDatabase()) return c.json({ error: "DATABASE_URL is not set on this deployment", code: "no_database" }, 503);
  const store = new PostgresStore();
  const existing = new Set((await store.all()).map((e) => e.version_id));
  const { entries, uncovered } = buildSeed();
  let n = 0;
  for (const e of entries) {
    if (existing.has(e.version_id)) continue;
    await store.insert(e);
    n++;
  }
  return c.json({ inserted: n, in_seed: entries.length, already_present: existing.size, uncovered });
});

function splitStatements(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
