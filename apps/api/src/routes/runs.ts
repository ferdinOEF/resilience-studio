/**
 * Runs (spec section 1.2 admin: every run as a chain of steps with hand-off details, agent log and audit export),
 * the scenario library index, and the studio's gate: what a place may show.
 */
import { Hono } from "hono";
import { PORTED_CHAIN_CONTRACTS } from "@resilience/contracts";
import { RETURN_PERIODS, type ReturnPeriod, type ScenarioId } from "@resilience/core";
import { DeterministicLiaison, exportAudit, libraryCoverage, markStale, PANJIM_LIBRARY, portedChainAgents, StubMetaMind, type ScenarioSpec } from "@resilience/meta-mind";
import { getLayer } from "@resilience/places";
import { PANJIM, resolveAll } from "@resilience/registry";
import { extentGeoJSON, zoneStats } from "../studio/geometry";
import { z } from "zod";
import { requireUser, sessionUser } from "../auth";
import { registryStore, writesAllowed } from "../registry";
import { currentContracts, runStore } from "../runs/stores";

export const runs = new Hono();

const ScenarioSchema = z.object({
  place: z.literal("panjim").default("panjim"),
  hazard: z.enum(["surge", "flood", "compound", "rain"]),
  return_periods: z.array(z.union([z.literal(1), z.literal(10), z.literal(50), z.literal(100)])).min(1).default([...RETURN_PERIODS] as ReturnPeriod[]),
  horizon: z.enum(["today", "2050", "2100"]).default("today"),
  pathway: z.enum(["ssp126", "ssp245", "ssp585"]).default("ssp245"),
  solution_set: z.object({ id: z.string().min(1), label: z.string().min(1), placements: z.array(z.object({ id: z.string(), solutionId: z.string(), segmentId: z.string(), params: z.record(z.string(), z.number()) })) }).default({ id: "do-nothing", label: "do nothing (today's measures)", placements: [] }),
  bunds_failed: z.boolean().optional()
});

const metaMind = new StubMetaMind();

/** Run the ported chain for a scenario: plan (Meta Mind) -> validate and execute (Liaison) -> store. Admin side only. */
runs.post("/", requireUser("run"), async (c) => {
  const w = writesAllowed();
  if (!w.ok) return c.json({ error: w.reason, code: "read_only" }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { question?: string; scenario?: unknown };
  const parsed = ScenarioSchema.safeParse(body.scenario ?? {});
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "invalid" }, 400);
  const scenario = parsed.data as ScenarioSpec;
  const all = await registryStore().all();
  const resolved = resolveAll(all, PANJIM, { allowUnapproved: true });
  const contracts = await currentContracts(PORTED_CHAIN_CONTRACTS);
  const plan = metaMind.plan(body.question ?? `${scenario.hazard} at RP ${scenario.return_periods.join("/")}, ${scenario.horizon} ${scenario.pathway}, ${scenario.solution_set.label}`, scenario);
  const liaison = new DeterministicLiaison({ agents: portedChainAgents(resolved), contracts, resolved, keepCells: true });
  const run = await liaison.execute(plan, c.get("user").email);
  // the Meta Mind's own entries (its plan, then its reading of the result) join the run's agent log
  const planned = metaMind.log.filter((l) => l.data?.plan_id === plan.id);
  run.log.unshift(...planned);
  const outlay = metaMind.read(run);
  run.log.push(...metaMind.log.filter((l) => l.data?.run_id === run.id));
  await runStore().insert(run);
  return c.json({ run: summarize(run), outlay }, run.status === "ok" ? 201 : 500);
});

runs.get("/", async (c) => {
  const all = await registryStore().all();
  const list = (await runStore().list({ place: c.req.query("place") ?? undefined, limit: Number(c.req.query("limit") ?? 100) })).map((r) => markStale(r, all));
  return c.json({ runs: list.map(summarize) });
});

runs.get("/library", async (c) => {
  const all = await registryStore().all();
  const list = (await runStore().list({ place: "panjim", limit: 1000 })).map((r) => markStale(r, all));
  return c.json({ place: "panjim", dimensions: PANJIM_LIBRARY, ...libraryCoverage("panjim", PANJIM_LIBRARY, list) });
});

runs.get("/:id", async (c) => {
  if (!sessionUser(c)) {
    const peek = await runStore().get(c.req.param("id"));
    if (!peek || !peek.chain_signed_off || peek.stale) return c.json({ error: "Sign in required for unsigned results", code: "unauthenticated" }, 401);
  }
  const run = await runStore().get(c.req.param("id"));
  if (!run) return c.json({ error: "not found" }, 404);
  const fresh = markStale(run, await registryStore().all());
  if (fresh.stale !== run.stale) await runStore().update(fresh);
  const { result, ...rest } = fresh;
  const cells = c.req.query("cells") === "1";
  return c.json({ run: { ...rest, result: result ? { ...result, depth_cells: cells ? result.depth_cells : undefined, depth_cell_count: result.depth_cells?.length ?? 0 } : null }, outlay: metaMind.read(fresh) });
});

runs.get("/:id/audit", async (c) => {
  const run = await runStore().get(c.req.param("id"));
  if (!run) return c.json({ error: "not found" }, 404);
  const rows = await registryStore().all();
  c.header("content-disposition", `attachment; filename="${run.id}-audit.json"`);
  return c.json(exportAudit(markStale(run, rows), rows));
});


/** A run, re-checked against the registry; with studio=1 only a signed-off, non-stale run is served (spec rule 2). */
async function runForMap(id: string, studio: boolean) {
  const run = await runStore().get(id);
  if (!run) return { error: "not found", status: 404 as const };
  const fresh = markStale(run, await registryStore().all());
  if (studio && (!fresh.chain_signed_off || fresh.stale || fresh.status !== "ok")) return { error: "this run is not shown in the studio: the chain is not signed off or the run is stale", status: 403 as const };
  return { run: fresh };
}

/** Flood extent polygons of the run's headline event (central bound), by depth band and behind-bund flag. */
runs.get("/:id/extent", async (c) => {
  if (c.req.query("studio") !== "1" && !sessionUser(c)) return c.json({ error: "Sign in required for unsigned results", code: "unauthenticated" }, 401);
  const r = await runForMap(c.req.param("id"), c.req.query("studio") === "1");
  if ("error" in r) return c.json({ error: r.error }, r.status);
  c.header("cache-control", "public, max-age=300");
  return c.json({ run_id: r.run.id, return_period: r.run.result?.headline_return_period ?? null, bound: "central", depth_band_m: 0.5, data: extentGeoJSON(r.run) });
});

/** Per-zone aggregates of the run over a zones layer of the place pack (admin-only while the zones are placeholders). */
runs.get("/:id/zones", async (c) => {
  if (c.req.query("studio") !== "1" && !sessionUser(c)) return c.json({ error: "Sign in required for unsigned results", code: "unauthenticated" }, 401);
  const r = await runForMap(c.req.param("id"), c.req.query("studio") === "1");
  if ("error" in r) return c.json({ error: r.error }, r.status);
  const layerId = c.req.query("layer") ?? "ward_zones";
  const layer = getLayer("panjim", layerId);
  if (!layer) return c.json({ error: `no zones layer ${layerId}` }, 404);
  if (layer.layer.admin_only && c.req.query("admin") !== "1") return c.json({ error: `${layerId} is admin-only (${layer.layer.grounding})`, code: "admin_only" }, 403);
  return c.json({ run_id: r.run.id, layer: layer.layer, ...zoneStats(r.run, layer.data as Parameters<typeof zoneStats>[1]) });
});

/** The studio's gate for a place: results only from a signed-off, non-stale chain run; otherwise "not yet modelled". */
runs.get("/studio/:place", async (c) => {
  const place = c.req.param("place");
  if (place !== "panjim") return c.json({ place, modelled: false, reason: "no place pack" });
  const all = await registryStore().all();
  const contracts = await currentContracts(PORTED_CHAIN_CONTRACTS);
  const list = (await runStore().list({ place, limit: 1000 })).map((r) => markStale(r, all)).filter((r) => r.status === "ok" && r.chain_signed_off && !r.stale);
  const byHazard: Partial<Record<ScenarioId, ReturnType<typeof summarize>>> = {};
  for (const r of list) if (r.plan.scenario.solution_set.id === "do-nothing" && !byHazard[r.plan.scenario.hazard]) byHazard[r.plan.scenario.hazard] = summarize(r);
  const modelled = Object.keys(byHazard).length > 0;
  const notSigned = contracts.filter((m) => m.calibration.status !== "signed_off").map((m) => m.id);
  return c.json({ place, modelled, reason: modelled ? null : notSigned.length ? `chain not signed off: ${notSigned.join(", ")} (calibration against a supplied event is outstanding)` : "no signed-off run yet", runs: byHazard });
});

export function summarize(run: Parameters<typeof markStale>[0]) {
  const { result, log, steps, handoffs, ...rest } = run;
  return { ...rest, steps: steps.length, handoffs: { total: handoffs.filter((h) => h.step > 0).length, failed: handoffs.filter((h) => !h.ok).length }, log_entries: log.length, result: result ? { totals: result.totals, headline_return_period: result.headline_return_period, per_segment: result.per_segment, annual: result.annual, by_return_period: result.by_return_period } : null };
}
