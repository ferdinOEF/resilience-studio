/**
 * The stub Meta Mind (Phase 1): plans the chain for a question, records the plan, reads a finished run and assembles
 * an outlay of references into it. It produces no number: every figure in an outlay is copied from the run with the
 * path it came from. Parameter changes go through requestVariant and become logged scenario variants.
 */
import { PORTED_CHAIN_HANDOFFS } from "@resilience/contracts";
import { logEntry, newId } from "./runlog";
import type { LogEntry, MetaMindAgent, Outlay, ParameterChange, Plan, RunRecord, ScenarioSpec, ScenarioVariant } from "./types";

export class StubMetaMind implements MetaMindAgent {
  readonly log: LogEntry[] = [];
  readonly plans: Plan[] = [];
  readonly variants: ScenarioVariant[] = [];

  plan(question: string, scenario: ScenarioSpec, variant?: ScenarioVariant): Plan {
    const steps: Plan["steps"] = [];
    for (const rp of scenario.return_periods) {
      steps.push({ model: "water-level", return_period: rp, inputs_from: [] });
      steps.push({ model: "damage", return_period: rp, inputs_from: PORTED_CHAIN_HANDOFFS.filter((h) => h.to_model === "damage") });
      steps.push({ model: "people", return_period: rp, inputs_from: PORTED_CHAIN_HANDOFFS.filter((h) => h.to_model === "people") });
    }
    if (scenario.return_periods.length >= 2) steps.push({ model: "loss", inputs_from: PORTED_CHAIN_HANDOFFS.filter((h) => h.to_model === "loss") });
    const plan: Plan = { id: newId("plan"), question, scenario, variant, steps, handoffs: PORTED_CHAIN_HANDOFFS, created_at: new Date().toISOString(), created_by: "meta-mind" };
    this.plans.push(plan);
    this.log.push(logEntry("meta-mind", `Plan ${plan.id}: ${steps.length} steps over ${scenario.return_periods.length} return periods for "${question}"`, { plan_id: plan.id }));
    return plan;
  }

  read(run: RunRecord): Outlay {
    const refs: Outlay["references"] = [];
    const parts: string[] = [];
    if (run.status !== "ok" || !run.result) {
      parts.push(`Run ${run.id} did not complete (${run.status}${run.error ? `: ${run.error}` : ""}); nothing to read.`);
    } else {
      const r = run.result;
      const rp = r.headline_return_period;
      refs.push({ label: `flooded area at RP ${rp}, central (km²)`, run_id: run.id, path: "result.totals.flooded_km2.central" });
      refs.push({ label: `people affected at RP ${rp}, central`, run_id: run.id, path: "result.totals.people_affected.central" });
      refs.push({ label: `direct damage at RP ${rp}, central (INR)`, run_id: run.id, path: "result.totals.damage_inr.central" });
      if (r.annual) {
        refs.push({ label: "expected annual damage, central (INR/yr)", run_id: run.id, path: "result.annual.ead_inr.central" });
        refs.push({ label: "people affected per year, central", run_id: run.id, path: "result.annual.people_per_year.central" });
      }
      const worst = [...r.per_segment].sort((a, b) => b.flooded_km2.central - a.flooded_km2.central)[0];
      if (worst) refs.push({ label: `segment with the largest flooded area, central: ${worst.id}`, run_id: run.id, path: `result.per_segment[id=${worst.id}].flooded_km2.central` });
      parts.push(`Run ${run.id} on ${run.plan.scenario.place}: ${run.plan.scenario.hazard}, return periods ${run.plan.scenario.return_periods.join("/")}, ${run.plan.scenario.horizon} ${run.plan.scenario.pathway}, solution set "${run.plan.scenario.solution_set.label}".`);
      parts.push(`The chain ran ${run.steps.length} steps with ${run.handoffs.filter((h) => h.ok).length} of ${run.handoffs.length} hand-offs passing validation.`);
      parts.push(run.chain_signed_off ? "Every model in the chain was signed off: the studio may show these results." : "The chain is not signed off: results stay on the admin side.");
      if (run.stale) parts.push("A registry value used here has since been superseded: the run is stale and must be re-run before use.");
      const flags = r.per_segment.flatMap((s) => s.flags.map((f) => `${s.id}: ${f}`));
      if (flags.length) parts.push(`Flags raised by the models: ${flags.join("; ")}.`);
    }
    const outlay: Outlay = { run_id: run.id, summary: parts.join(" "), references: refs, proposals: [] };
    this.log.push(logEntry("meta-mind", `Read run ${run.id}: ${refs.length} references, ${outlay.proposals.length} proposals`, { run_id: run.id }));
    return outlay;
  }

  requestVariant(base: ScenarioSpec, changes: ParameterChange[], reason: string): ScenarioVariant {
    if (!reason) throw new Error("a scenario variant needs a reason");
    if (!changes.length) throw new Error("a scenario variant needs at least one parameter change");
    const v: ScenarioVariant = { id: newId("var"), base, changes, reason, requested_by: "meta-mind", created_at: new Date().toISOString() };
    this.variants.push(v);
    this.log.push(logEntry("meta-mind", `Requested scenario variant ${v.id}: ${changes.map((c) => `${c.registry_id} ${c.from} -> ${c.to}`).join(", ")} (${reason})`, { variant_id: v.id }));
    return v;
  }
}
