/**
 * The deterministic Liaison (spec section 1.3, tier 2). It validates every hand-off of the plan against the contracts
 * before anything runs, executes the model agents in order per return period and bound, checks the values at every
 * hand-off, retries a failed model run with identical inputs up to the contract's limit, and logs everything.
 * It never changes a parameter and never routes outside the contracts.
 */
import { checkValues, expandDependencies, gateStatus, validateChain, validateHandoff, type Handoff, type ModelContract } from "@resilience/contracts";
import { DEFAULT_RP, type Bound, type ReturnPeriod } from "@resilience/core";
import type { Resolved } from "@resilience/registry";
import { BOUNDS, type EventTable } from "./agents";
import { logEntry, newId } from "./runlog";
import type { HandoffRecord, LiaisonAgent, LogEntry, ModelAgent, ModelInputs, ModelOutputs, Plan, RunRecord, RunResult, StepRecord } from "./types";

export interface LiaisonOptions {
  agents: ModelAgent[];
  /** contracts as they stand now (calibration status may be patched by the admin's model status) */
  contracts: ModelContract[];
  /** the registry resolved for the place (admin side: unapproved allowed); used for the audit trail and the sign-off gate */
  resolved: Map<string, Resolved>;
  /** keep per-cell depths of the headline event in the result (for the map); off for bulk library runs */
  keepCells?: boolean;
}

const now = () => new Date().toISOString();

export class DeterministicLiaison implements LiaisonAgent {
  private agentsById: Map<string, ModelAgent>;
  constructor(private opts: LiaisonOptions) {
    this.agentsById = new Map(opts.agents.map((a) => [a.contract.id, a]));
  }

  check(plan: Plan) {
    return validateChain(this.opts.contracts, plan.handoffs);
  }

  async execute(plan: Plan, requestedBy: string): Promise<RunRecord> {
    const t0 = Date.now();
    const log: LogEntry[] = [logEntry("liaison", `Run requested by ${requestedBy} for plan ${plan.id}`)];
    const run: RunRecord = {
      id: newId("run"), created_at: now(), requested_by: requestedBy, plan, status: "running",
      contracts: this.opts.contracts.map((c) => ({ id: c.id, version: c.version, calibration_status: c.calibration.status })),
      registry_versions: [], steps: [], handoffs: [], log, result: null, error: null, stale: false, chain_signed_off: false, duration_ms: 0
    };
    try {
      // 1. the plan must pass the validator before any model runs
      const check = this.check(plan);
      for (const c of check.checks) run.handoffs.push({ ...c, step: 0, t: now() });
      if (!check.ok) {
        const bad = check.checks.filter((c) => !c.ok).map((c) => `${c.from.model}.${c.from.output} -> ${c.to.model}.${c.to.input}: ${c.errors.map((e) => e.code).join(", ")}`);
        throw new Error(`plan rejected by the contract validator: ${bad.join("; ")}`);
      }
      log.push(logEntry("validator", `${check.checks.length} planned hand-offs pass the contracts`));
      for (const m of ["water-level", "damage", "people", "loss"]) if (!this.agentsById.has(m)) throw new Error(`no model agent for ${m}`);

      // 2. execute per return period and bound
      const scenario = plan.scenario;
      const rps = [...scenario.return_periods].sort((a, b) => a - b);
      const headlineRp: ReturnPeriod = rps.includes(DEFAULT_RP) ? DEFAULT_RP : rps[rps.length - 1];
      const damageByRp: Record<Bound, EventTable[]> = { low: [], central: [], high: [] };
      const peopleByRp: Record<Bound, EventTable[]> = { low: [], central: [], high: [] };
      const perRp: { rp: ReturnPeriod; damage_inr: Record<Bound, number>; people: Record<Bound, number> }[] = [];
      let headline: { wl: Record<Bound, ModelOutputs>; dm: Record<Bound, ModelOutputs>; pp: Record<Bound, ModelOutputs> } | null = null;
      const used = new Map<string, true>();
      let stepNo = 0;

      for (const rp of rps) {
        const wl = {} as Record<Bound, ModelOutputs>, dm = {} as Record<Bound, ModelOutputs>, pp = {} as Record<Bound, ModelOutputs>;
        for (const bound of BOUNDS) {
          const base: Omit<ModelInputs, "upstream"> = { scenario, return_period: rp, bound };
          wl[bound] = await this.step(run, ++stepNo, "water-level", { ...base, upstream: {} }, used);
          const downstream = { depth: wl[bound].ports.depth, extent_classes: wl[bound].ports.extent_classes };
          this.handoff(run, stepNo, rp, plan.handoffs.filter((h) => h.from_model === "water-level" && h.to_model === "damage"), wl[bound]);
          dm[bound] = await this.step(run, ++stepNo, "damage", { ...base, upstream: downstream }, used);
          this.handoff(run, stepNo, rp, plan.handoffs.filter((h) => h.from_model === "water-level" && h.to_model === "people"), wl[bound]);
          pp[bound] = await this.step(run, ++stepNo, "people", { ...base, upstream: downstream }, used);
          damageByRp[bound].push({ rp, value: dm[bound].ports.damage_total as number });
          peopleByRp[bound].push({ rp, value: pp[bound].ports.people_total as number });
        }
        perRp.push({ rp, damage_inr: { low: dm.low.ports.damage_total as number, central: dm.central.ports.damage_total as number, high: dm.high.ports.damage_total as number }, people: { low: pp.low.ports.people_total as number, central: pp.central.ports.people_total as number, high: pp.high.ports.people_total as number } });
        if (rp === headlineRp) headline = { wl, dm, pp };
      }

      // 3. annual integration over the return periods
      let annual: RunResult["annual"] = null;
      if (rps.length >= 2) {
        const per = {} as Record<Bound, ModelOutputs>;
        for (const bound of BOUNDS) {
          this.handoff(run, stepNo, undefined, plan.handoffs.filter((h) => h.to_model === "loss"), null, { damage_total: damageByRp[bound].map((d) => d.value), people_total: peopleByRp[bound].map((p) => p.value) });
          per[bound] = await this.step(run, ++stepNo, "loss", { scenario, return_period: headlineRp, bound, upstream: { damage_by_return_period: damageByRp[bound], people_by_return_period: peopleByRp[bound] } }, used);
        }
        annual = { ead_inr: { low: per.low.ports.expected_annual_damage as number, central: per.central.ports.expected_annual_damage as number, high: per.high.ports.expected_annual_damage as number }, people_per_year: { low: per.low.ports.people_per_year as number, central: per.central.ports.people_per_year as number, high: per.high.ports.people_per_year as number } };
      } else log.push(logEntry("liaison", "one return period only: no annual integration (loss step skipped)"));

      // 4. the result digest, the registry versions used, and the gate
      run.result = this.assemble(headline!, headlineRp, perRp, annual);
      run.registry_versions = this.registryVersions([...used.keys()]);
      run.chain_signed_off = this.gate(run);
      run.status = "ok";
      log.push(logEntry("liaison", `Run complete: ${run.steps.length} steps, ${run.handoffs.filter((h) => h.step > 0).length} hand-offs, ${run.registry_versions.length} registry versions read; chain ${run.chain_signed_off ? "signed off" : "not signed off"}`));
    } catch (e) {
      run.status = "failed";
      run.error = e instanceof Error ? e.message : String(e);
      log.push(logEntry("liaison", `Run failed: ${run.error}`));
    }
    run.duration_ms = Date.now() - t0;
    return run;
  }

  /** Run one model agent with retries on identical inputs; record the step. */
  private async step(run: RunRecord, stepNo: number, model: string, inputs: ModelInputs, used: Map<string, true>): Promise<ModelOutputs> {
    const agent = this.agentsById.get(model)!;
    const contract = this.opts.contracts.find((c) => c.id === model) ?? agent.contract;
    const started = now();
    const maxAttempts = contract.agent.retries + 1;
    let attempts = 0;
    let lastError: unknown = null;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        const out = await agent.run(inputs);
        for (const id of out.registry_ids_read) used.set(id, true);
        for (const port of contract.outputs) {
          const v = out.ports[port.name];
          if (v === undefined && port.required) out.anomalies.push(`required output ${port.name} missing`);
        }
        run.steps.push({ step: stepNo, model, contract_version: contract.version, return_period: inputs.return_period, status: attempts > 1 ? "retried" : "ok", started_at: started, finished_at: now(), attempts, outputs: { [inputs.bound]: digest(out) } as StepRecord["outputs"], anomalies: out.anomalies });
        run.log.push(logEntry(`${model} agent`, `step ${stepNo} ${model} RP ${inputs.return_period} ${inputs.bound}: ok${attempts > 1 ? ` after ${attempts} attempts` : ""}${out.anomalies.length ? `; ${out.anomalies.length} anomalies` : ""}`));
        return out;
      } catch (e) {
        lastError = e;
        run.log.push(logEntry(`${model} agent`, `step ${stepNo} ${model} attempt ${attempts} failed: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    run.steps.push({ step: stepNo, model, contract_version: contract.version, return_period: inputs.return_period, status: "failed", started_at: started, finished_at: now(), attempts, outputs: {} as StepRecord["outputs"], anomalies: [String(lastError)] });
    throw new Error(`${model} failed after ${attempts} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  /** Validate declared hand-offs again at run time, with the actual values checked against the target port's range. */
  private handoff(run: RunRecord, stepNo: number, rp: ReturnPeriod | undefined, handoffs: Handoff[], source: ModelOutputs | null, values?: Record<string, ArrayLike<number>>) {
    for (const h of handoffs) {
      const s = this.opts.contracts.find((c) => c.id === h.from_model)!;
      const t = this.opts.contracts.find((c) => c.id === h.to_model)!;
      const check = validateHandoff(s, t, h);
      const port = t.inputs.find((p) => p.name === h.input)!;
      const raw = values ? values[h.output] : (source?.ports[h.output] as ArrayLike<number> | undefined);
      const rec: HandoffRecord = { ...check, step: stepNo, return_period: rp, t: now() };
      if (raw && typeof raw !== "number" && port.dtype !== "table") rec.values = checkValues(port, raw);
      else if (Array.isArray(raw)) rec.values = checkValues(port, raw as number[]);
      if (rec.values && !rec.values.ok) { rec.ok = false; rec.errors = [...rec.errors, { code: "range", message: rec.values.message }]; }
      run.handoffs.push(rec);
      if (!rec.ok) throw new Error(`hand-off ${h.from_model}.${h.output} -> ${h.to_model}.${h.input} rejected: ${rec.errors.map((e) => e.message).join("; ")}`);
      run.log.push(logEntry("liaison", `hand-off ${h.from_model}.${h.output} -> ${h.to_model}.${h.input}: ${rec.values?.message ?? "validated"}`));
    }
  }

  private registryVersions(ids: string[]): RunRecord["registry_versions"] {
    const all = [...this.opts.resolved.keys()];
    const deps = new Set(ids);
    for (const c of this.opts.contracts) for (const d of expandDependencies(c.registry_dependencies, all)) if (this.opts.resolved.has(d)) deps.add(d);
    return [...deps].sort().flatMap((id) => {
      const r = this.opts.resolved.get(id);
      return r ? [{ id, version_id: r.entry.version_id, level_used: r.levelUsed, status: r.entry.status }] : [];
    });
  }

  private gate(run: RunRecord): boolean {
    const all = [...this.opts.resolved.keys()];
    const approved = new Set(all.filter((id) => this.opts.resolved.get(id)!.entry.status === "approved"));
    const verdicts = this.opts.contracts.map((c) => ({ id: c.id, ...gateStatus(c, approved, all) }));
    for (const v of verdicts) if (!v.signed_off) run.log.push(logEntry("framework", `${v.id} not signed off: calibration ${this.opts.contracts.find((c) => c.id === v.id)!.calibration.status}${v.unapproved.length ? `, ${v.unapproved.length} registry entries not approved` : ""}${v.missing.length ? `, ${v.missing.length} dependencies missing` : ""}`));
    return verdicts.every((v) => v.signed_off);
  }

  private assemble(h: { wl: Record<Bound, ModelOutputs>; dm: Record<Bound, ModelOutputs>; pp: Record<Bound, ModelOutputs> }, headlineRp: ReturnPeriod, perRp: RunResult["by_return_period"], annual: RunResult["annual"]): RunResult {
    type Summary = { sum: { floodedKm2: number; bundedKm2: number }; segments: { id: string; shorelineWlM: number; extent: { floodedKm2: number }; flags: string[] }[] };
    const sum = (b: Bound) => (h.wl[b].ports._summary as Summary);
    const n = (o: ModelOutputs, port: string) => o.ports[port] as number;
    const central = sum("central");
    const peopleSeg = Object.fromEntries((h.pp.central.ports.people_by_segment as { segment: string; people: number }[]).map((x) => [x.segment, x.people]));
    const damageSeg = Object.fromEntries((h.dm.central.ports.damage_by_segment as { segment: string; damage_inr: number }[]).map((x) => [x.segment, x.damage_inr]));
    const result: RunResult = {
      totals: {
        flooded_km2: { low: sum("low").sum.floodedKm2, central: central.sum.floodedKm2, high: sum("high").sum.floodedKm2 },
        bunded_km2: { low: sum("low").sum.bundedKm2, central: central.sum.bundedKm2, high: sum("high").sum.bundedKm2 },
        people_affected: { low: n(h.pp.low, "people_total"), central: n(h.pp.central, "people_total"), high: n(h.pp.high, "people_total") },
        damage_inr: { low: n(h.dm.low, "damage_total"), central: n(h.dm.central, "damage_total"), high: n(h.dm.high, "damage_total") },
        buildings_wet: { low: n(h.dm.low, "buildings_wet"), central: n(h.dm.central, "buildings_wet"), high: n(h.dm.high, "buildings_wet") }
      },
      headline_return_period: headlineRp,
      per_segment: central.segments.map((s, k) => ({
        id: s.id,
        shoreline_wl_m: { low: sum("low").segments[k].shorelineWlM, central: s.shorelineWlM, high: sum("high").segments[k].shorelineWlM },
        flooded_km2: { low: sum("low").segments[k].extent.floodedKm2, central: s.extent.floodedKm2, high: sum("high").segments[k].extent.floodedKm2 },
        people: peopleSeg[s.id] ?? null,
        damage_inr: damageSeg[s.id] ?? null,
        flags: s.flags
      })),
      annual,
      by_return_period: perRp
    };
    if (this.opts.keepCells !== false) {
      const depth = h.wl.central.ports.depth as Float32Array;
      const cls = h.wl.central.ports.extent_classes as Uint8Array;
      const cells: NonNullable<RunResult["depth_cells"]> = [];
      for (let i = 0; i < cls.length; i++) if (cls[i] >= 2) cells.push({ index: i, depth_m: Math.round(depth[i] * 1000) / 1000, cls: cls[i] });
      result.depth_cells = cells;
    }
    return result;
  }
}

/** Summary statistics of a step's outputs, for the record (grids are not stored in the log). */
function digest(out: ModelOutputs): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out.ports)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "number") d[k] = v;
    else if (v instanceof Float32Array || v instanceof Float64Array || v instanceof Uint8Array) {
      let min = Infinity, max = -Infinity, nz = 0;
      for (let i = 0; i < v.length; i++) { const x = v[i]; if (!Number.isFinite(x)) continue; if (x !== 0) nz++; if (x < min) min = x; if (x > max) max = x; }
      d[k] = { cells: v.length, nonzero: nz, min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
    } else if (Array.isArray(v)) d[k] = { rows: v.length, first: v[0] ?? null };
  }
  return d;
}
