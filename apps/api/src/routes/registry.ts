/**
 * Registry API (spec section 3): list, versions, diff, resolve for a place, propose, submit, approve, reject.
 * Reads are open to any signed-in admin-side user; the studio reads only resolved, approved values through /resolve.
 */
import { Hono, type Context } from "hono";
import { diffVersions, groupById, PANJIM, RegistryError, resolveAll, currentVersion, type Place, type RegistryEntry } from "@resilience/registry";
import { registryService, registryStore, writesAllowed } from "../registry";
import { requireUser } from "../auth";

export const registry = new Hono();

const PLACES: Record<string, Place> = { panjim: PANJIM };

function placeOf(q: string | undefined): Place {
  return PLACES[q ?? "panjim"] ?? PANJIM;
}

function fail(c: Context, e: unknown) {
  if (e instanceof RegistryError) {
    const status = e.code === "not_found" ? 404 : e.code === "two_person" || e.code === "forbidden" ? 403 : e.code === "no_source" || e.code === "invalid" ? 400 : 409;
    return c.json({ error: e.message, code: e.code }, status);
  }
  throw e;
}

/** Summary per id: the current version at each level, counts, and whether anything is awaiting review. */
registry.get("/", async (c) => {
  const all = await registryStore().all();
  const q = (c.req.query("q") ?? "").toLowerCase();
  const status = c.req.query("status");
  const out: Array<{ id: string; label: string; kind: string; unit: string; level: string; geography: string; grounding: string; status: string; version: number; version_id: string; versions: number; pending: number; value: RegistryEntry["value"]; source_type: string; citation_ids: string[]; used_by: string[] }> = [];
  for (const [id, versions] of groupById(all)) {
    const cur = currentVersion(versions, ["approved", "in_review", "draft"]);
    if (!cur) continue;
    if (q && !`${id} ${cur.label} ${cur.source.citation}`.toLowerCase().includes(q)) continue;
    const pending = versions.filter((v) => v.status === "in_review").length;
    if (status && cur.status !== status && !(status === "in_review" && pending)) continue;
    out.push({ id, label: cur.label, kind: cur.kind, unit: cur.unit, level: cur.level, geography: cur.geography, grounding: cur.grounding, status: cur.status, version: cur.version, version_id: cur.version_id, versions: versions.length, pending, value: cur.value, source_type: cur.source.source_type, citation_ids: cur.source.citation_ids, used_by: cur.used_by });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  const current = [...groupById(all).values()].map((vs) => currentVersion(vs, ["approved", "in_review", "draft"])).filter((v): v is RegistryEntry => !!v);
  const counts = { total: current.length, approved: current.filter((o) => o.status === "approved").length, in_review: all.filter((v) => v.status === "in_review").length, draft: all.filter((v) => v.status === "draft").length, placeholders: current.filter((o) => o.grounding === "placeholder_needs_calibration").length, shown: out.length };
  return c.json({ entries: out, counts, writes: writesAllowed() });
});

/** Every number the studio may show for a place: the resolved current approved version per id, with the level used. */
registry.get("/resolve", async (c) => {
  const all = await registryStore().all();
  const admin = c.req.query("admin") === "1";
  const resolved = resolveAll(all, placeOf(c.req.query("place")), { allowUnapproved: admin });
  const out: Record<string, { version_id: string; value: RegistryEntry["value"]; unit: string; level_used: string; level_label: string; grounding: string; status: string; citation: string; citation_ids: string[]; overrode: string[] }> = {};
  for (const [id, r] of resolved) out[id] = { version_id: r.entry.version_id, value: r.entry.value, unit: r.entry.unit, level_used: r.levelUsed, level_label: r.levelLabel, grounding: r.entry.grounding, status: r.entry.status, citation: r.entry.source.citation, citation_ids: r.entry.source.citation_ids, overrode: r.overrode };
  return c.json({ place: c.req.query("place") ?? "panjim", resolved: out });
});

registry.get("/version/:vid", async (c) => {
  const row = await registryStore().get(c.req.param("vid"));
  return row ? c.json({ entry: row }) : c.json({ error: "not found" }, 404);
});

registry.get("/diff", async (c) => {
  const a = await registryStore().get(c.req.query("a") ?? "");
  const b = await registryStore().get(c.req.query("b") ?? "");
  if (!a || !b) return c.json({ error: "both a and b must be version ids" }, 400);
  return c.json({ a: a.version_id, b: b.version_id, changes: diffVersions(a, b) });
});

registry.get("/:id/versions", async (c) => {
  const versions = await registryStore().versions(c.req.param("id"));
  if (!versions.length) return c.json({ error: "not found" }, 404);
  return c.json({ id: c.req.param("id"), versions });
});

function guardWrites() {
  const w = writesAllowed();
  return w.ok ? null : w.reason!;
}

registry.post("/", requireUser("propose"), async (c) => {
  const blocked = guardWrites();
  if (blocked) return c.json({ error: blocked, code: "read_only" }, 503);
  try {
    const row = await registryService().propose(await c.req.json(), c.get("user").email);
    return c.json({ entry: row }, 201);
  } catch (e) {
    return fail(c, e);
  }
});

registry.post("/:vid/submit", requireUser("propose"), async (c) => {
  const blocked = guardWrites();
  if (blocked) return c.json({ error: blocked, code: "read_only" }, 503);
  try {
    return c.json({ entry: await registryService().submit(c.req.param("vid")) });
  } catch (e) {
    return fail(c, e);
  }
});

registry.post("/:vid/approve", requireUser("review"), async (c) => {
  const blocked = guardWrites();
  if (blocked) return c.json({ error: blocked, code: "read_only" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  try {
    return c.json({ entry: await registryService().approve(c.req.param("vid"), c.get("user").email, body.note ?? null) });
  } catch (e) {
    return fail(c, e);
  }
});

registry.post("/:vid/reject", requireUser("review"), async (c) => {
  const blocked = guardWrites();
  if (blocked) return c.json({ error: blocked, code: "read_only" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { note?: string };
  try {
    return c.json({ entry: await registryService().reject(c.req.param("vid"), c.get("user").email, body.note ?? "") });
  } catch (e) {
    return fail(c, e);
  }
});
