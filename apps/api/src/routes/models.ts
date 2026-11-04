/**
 * Models (spec section 1.2 admin): contracts, health, calibration status; the sign-off flip is gated on approval of
 * every registry entry the model reads (spec section 3.2, gating).
 */
import { Hono } from "hono";
import { expandDependencies, gateStatus, PORTED_CHAIN_CONTRACTS, PORTED_CHAIN_HANDOFFS, validateChain } from "@resilience/contracts";
import { currentVersion, groupById, PANJIM, resolveAll } from "@resilience/registry";
import { z } from "zod";
import { requireUser } from "../auth";
import { registryStore, writesAllowed } from "../registry";
import { currentContracts, modelStatusStore } from "../runs/stores";

export const models = new Hono();

async function gates() {
  const all = await registryStore().all();
  const ids = [...groupById(all).keys()];
  const approved = new Set(ids.filter((id) => currentVersion(groupById(all).get(id)!, ["approved"]) !== null));
  const resolved = resolveAll(all, PANJIM, { allowUnapproved: true });
  const contracts = await currentContracts(PORTED_CHAIN_CONTRACTS);
  return { contracts, ids, approved, resolved };
}

models.get("/", async (c) => {
  const { contracts, ids, approved } = await gates();
  const chain = validateChain(contracts, PORTED_CHAIN_HANDOFFS);
  return c.json({
    models: contracts.map((m) => {
      const g = gateStatus(m, approved, ids);
      const deps = expandDependencies(m.registry_dependencies, ids);
      return { id: m.id, name: m.name, version: m.version, kind: m.kind, grounding: m.grounding, calibration: m.calibration, inputs: m.inputs.length, outputs: m.outputs.length, routing: m.routing.length, agent: m.agent, registry_dependencies: { declared: m.registry_dependencies, resolved: deps.length, approved: deps.length - g.unapproved.length - g.missing.length, unapproved: g.unapproved, missing: g.missing }, gate: { signed_off: g.signed_off, blocked_by: m.calibration.status !== "signed_off" ? ["calibration"] : [], unapproved_count: g.unapproved.length }, health: "healthy" };
    }),
    chain: { ok: chain.ok, handoffs: chain.checks.length, failing: chain.checks.filter((x) => !x.ok).length },
    writes: writesAllowed()
  });
});

models.get("/:id", async (c) => {
  const { contracts, ids, approved } = await gates();
  const m = contracts.find((x) => x.id === c.req.param("id"));
  if (!m) return c.json({ error: "not found" }, 404);
  return c.json({ model: m, gate: gateStatus(m, approved, ids) });
});

const StatusBody = z.object({
  status: z.enum(["uncalibrated", "calibrated", "signed_off"]),
  event: z.object({ event: z.string().min(1), date: z.string().min(4), metrics: z.record(z.string(), z.number()), note: z.string().default("") }).optional(),
  note: z.string().optional()
});

/** Set a model's calibration status. signed_off requires every registry dependency approved (the gate); the flip is logged with who did it. */
models.post("/:id/status", requireUser("sign_off"), async (c) => {
  const w = writesAllowed();
  if (!w.ok) return c.json({ error: w.reason, code: "read_only" }, 503);
  const parsed = StatusBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "invalid" }, 400);
  const { contracts, ids, approved } = await gates();
  const m = contracts.find((x) => x.id === c.req.param("id"));
  if (!m) return c.json({ error: "not found" }, 404);
  const events = parsed.data.event ? [...m.calibration.events, parsed.data.event] : m.calibration.events;
  if (parsed.data.status === "signed_off") {
    const g = gateStatus({ ...m, calibration: { ...m.calibration, status: "signed_off", events } }, approved, ids);
    if (!g.signed_off) return c.json({ error: `cannot sign off ${m.id}: ${g.unapproved.length} registry entries it reads are not approved${g.missing.length ? `, ${g.missing.length} dependencies missing` : ""}`, code: "gate", unapproved: g.unapproved, missing: g.missing }, 409);
    if (!events.length) return c.json({ error: `cannot sign off ${m.id}: no calibration event is recorded (spec section 2: calibration events with metrics and date)`, code: "gate" }, 409);
  }
  const user = c.get("user");
  await modelStatusStore().set({ model_id: m.id, calibration_status: parsed.data.status, events, signed_off_by: parsed.data.status === "signed_off" ? user.email : null, signed_off_at: parsed.data.status === "signed_off" ? new Date().toISOString() : null, updated_by: user.email });
  const after = (await currentContracts(PORTED_CHAIN_CONTRACTS)).find((x) => x.id === m.id)!;
  return c.json({ model: after, gate: gateStatus(after, approved, ids) });
});
