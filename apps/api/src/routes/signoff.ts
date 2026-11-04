/** The sign-off queue: policy findings, registry edits, calibration claims and chain sign-offs awaiting a human. */
import { Hono } from "hono";
import { SignOffError, SignOffQueue, type SignOffItem } from "@resilience/meta-mind";
import { z } from "zod";
import { requireUser } from "../auth";
import { writesAllowed } from "../registry";
import { signOffStore } from "../runs/stores";

export const signoff = new Hono();

const Input = z.object({
  kind: z.enum(["policy_finding", "registry_edit", "calibration_claim", "chain_sign_off"]),
  title: z.string().min(1),
  reasoning: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

signoff.get("/", async (c) => {
  const status = c.req.query("status") as SignOffItem["status"] | undefined;
  const items = await new SignOffQueue(signOffStore()).list(status);
  return c.json({ items, counts: { pending: items.filter((i) => i.status === "pending").length } });
});

signoff.post("/", requireUser("propose"), async (c) => {
  const w = writesAllowed();
  if (!w.ok) return c.json({ error: w.reason, code: "read_only" }, 503);
  const parsed = Input.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "invalid" }, 400);
  const item = await new SignOffQueue(signOffStore()).propose({ ...parsed.data, proposed_by: c.get("user").email });
  return c.json({ item }, 201);
});

for (const decision of ["approve", "reject"] as const) {
  signoff.post(`/:id/${decision}`, requireUser("sign_off"), async (c) => {
    const w = writesAllowed();
    if (!w.ok) return c.json({ error: w.reason, code: "read_only" }, 503);
    const body = (await c.req.json().catch(() => ({}))) as { note?: string };
    try {
      const item = await new SignOffQueue(signOffStore()).decide(c.req.param("id"), decision === "approve" ? "approved" : "rejected", c.get("user").email, body.note ?? null);
      return c.json({ item });
    } catch (e) {
      if (e instanceof SignOffError) return c.json({ error: e.message, code: e.code }, e.code === "not_found" ? 404 : e.code === "two_person" ? 403 : e.code === "invalid" ? 400 : 409);
      throw e;
    }
  });
}
