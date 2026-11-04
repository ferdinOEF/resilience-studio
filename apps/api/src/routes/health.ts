import { Hono } from "hono";
import { hasDatabase, sql } from "../db";

export const health = new Hono();

/** Liveness, plus whether Postgres + PostGIS are reachable (never fails the deployment: the studio must still load). */
health.get("/", async (c) => {
  const out: Record<string, unknown> = { ok: true, service: "resilience-studio-api", time: new Date().toISOString(), database: "not configured" };
  if (hasDatabase()) {
    try {
      const rows = await sql()`select current_setting('server_version') as pg, (select extversion from pg_extension where extname = 'postgis') as postgis`;
      out.database = { postgres: rows[0]?.pg ?? null, postgis: rows[0]?.postgis ?? null };
    } catch (e) {
      out.database = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return c.json(out);
});
