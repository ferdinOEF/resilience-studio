/**
 * Apply apps/api/migrations/*.sql in name order, once each (recorded in schema_migrations).
 *   DATABASE_URL=... pnpm --filter @resilience/api db:migrate
 * Uses the WebSocket pool so a migration file can hold several statements in one transaction.
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from schema_migrations")).rows.map((r: { name: string }) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) { console.log(`skip  ${f}`); continue; }
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`apply ${f}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
} finally {
  client.release();
  await pool.end();
}
