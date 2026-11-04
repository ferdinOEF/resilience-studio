/**
 * Meta Mind tiers (spec section 1.3) as typed interfaces. In Phase 1 the Liaison is deterministic and the Meta Mind is a
 * stub that records plans and reads results. The rules are enforced in the types and the run log, not by goodwill:
 *
 *   Meta Mind     plans, reads, assembles, proposes; may request scenario variants through the framework rules.
 *                 Never produces a number, never applies a registry edit, never publishes a finding without sign-off.
 *   Liaison       moves data between models per the contract routing rules; regrids, converts, aligns, merges; logs every hand-off.
 *                 Never changes a parameter, never re-routes outside the contracts, never silently re-runs.
 *   Model agents  set up and execute one model's run; may retry a failed run with identical inputs; report anomalies.
 *                 Never alter inputs, never tune parameters.
 */
import type { Handoff, HandoffCheck, ModelContract } from "@resilience/contracts";
import type { Bound, Placement, ReturnPeriod, ScenarioId } from "@resilience/core";
import type { UsedVersion } from "@resilience/registry";

export type Tier = "meta-mind" | "liaison" | "model-agent" | "validator" | "framework";

/** The question a run answers: a scenario on a place, with the measures in force. */
export interface ScenarioSpec {
  place: string;
  hazard: ScenarioId;
  return_periods: ReturnPeriod[];
  /** sea-level horizon and pathway */
  horizon: "today" | "2050" | "2100";
  pathway: "ssp126" | "ssp245" | "ssp585";
  /** "do-nothing" = today's measures only (the baseline); otherwise the solution set placed on top */
  solution_set: { id: string; label: string; placements: Placement[] };
  bunds_failed?: boolean;
}

/** A parameter change the Meta Mind requested through the framework rules: it becomes a logged scenario variant. */
export interface ParameterChange {
  registry_id: string;
  from: number;
  to: number;
  bound?: Bound;
}

export interface ScenarioVariant {
  id: string;
  base: ScenarioSpec;
  changes: ParameterChange[];
  reason: string;
  requested_by: Tier;
  created_at: string;
}

export interface PlanStep {
  model: string;
  /** which return period this step serves, when the model runs per event */
  return_period?: ReturnPeriod;
  inputs_from: Handoff[];
}

export interface Plan {
  id: string;
  question: string;
  scenario: ScenarioSpec;
  variant?: ScenarioVariant;
  steps: PlanStep[];
  handoffs: Handoff[];
  created_at: string;
  created_by: Tier;
}

export interface LogEntry {
  t: string;
  who: Tier | string;
  message: string;
  data?: Record<string, unknown>;
}

export interface HandoffRecord extends HandoffCheck {
  step: number;
  return_period?: ReturnPeriod;
  /** the Liaison's basic check on the actual values (min, max, non-finite count) */
  values?: { ok: boolean; message: string; min: number; max: number; nan: number };
  t: string;
}

export interface StepRecord {
  step: number;
  model: string;
  contract_version: string;
  return_period?: ReturnPeriod;
  status: "ok" | "failed" | "retried";
  started_at: string;
  finished_at: string;
  attempts: number;
  /** per bound, the outputs' digests: names and summary statistics, not the grids */
  outputs: Record<Bound, Record<string, unknown>>;
  anomalies: string[];
}

export interface RunResult {
  /** totals per bound (low = least favourable, high = most favourable), as the engine names them */
  totals: {
    flooded_km2: Record<Bound, number>;
    bunded_km2: Record<Bound, number>;
    people_affected: Record<Bound, number>;
    damage_inr: Record<Bound, number>;
    buildings_wet: Record<Bound, number>;
  };
  /** at the headline return period */
  headline_return_period: ReturnPeriod;
  per_segment: { id: string; shoreline_wl_m: Record<Bound, number>; flooded_km2: Record<Bound, number>; people: number | null; damage_inr: number | null; flags: string[] }[];
  annual: { ead_inr: Record<Bound, number>; people_per_year: Record<Bound, number> } | null;
  by_return_period: { rp: ReturnPeriod; damage_inr: Record<Bound, number>; people: Record<Bound, number> }[];
  /** per cell depth at the headline return period, central bound, newly flooded or behind bunds; for the map */
  depth_cells?: { index: number; depth_m: number; cls: number }[];
}

export type RunStatus = "planned" | "running" | "ok" | "failed";

export interface RunRecord {
  id: string;
  created_at: string;
  requested_by: string;
  plan: Plan;
  status: RunStatus;
  /** contracts as they were at run time */
  contracts: { id: string; version: string; calibration_status: string }[];
  /** every registry version the chain read, with the level used */
  registry_versions: (UsedVersion & { level_used: string; status: string })[];
  steps: StepRecord[];
  handoffs: HandoffRecord[];
  log: LogEntry[];
  result: RunResult | null;
  error: string | null;
  /** set by the framework when a registry value used here was superseded */
  stale: boolean;
  /** true only when every contract in the chain was signed_off at run time: the studio may show it */
  chain_signed_off: boolean;
  duration_ms: number;
}

/* ---------------------------------------------------------------- agents */

export interface ModelInputs {
  /** the scenario and the resolved registry values; models never alter these */
  scenario: ScenarioSpec;
  return_period: ReturnPeriod;
  bound: Bound;
  /** what earlier models produced, by port name */
  upstream: Record<string, unknown>;
}

export interface ModelOutputs {
  /** by output port name; grids as typed arrays, tables as arrays of rows, scalars as numbers */
  ports: Record<string, unknown>;
  anomalies: string[];
  /** which registry ids this run read (for the audit trail) */
  registry_ids_read: string[];
}

export interface ModelAgent {
  contract: ModelContract;
  run(inputs: ModelInputs): Promise<ModelOutputs>;
}

export interface LiaisonAgent {
  /** validate every hand-off of a plan against the contracts before anything runs */
  check(plan: Plan): { ok: boolean; checks: HandoffCheck[] };
  /** execute the plan: every hand-off validated, converted per the contract rules, and logged */
  execute(plan: Plan, requestedBy: string): Promise<RunRecord>;
}

export interface MetaMindAgent {
  /** plan the chain for a question; the plan is recorded before anything runs */
  plan(question: string, scenario: ScenarioSpec, variant?: ScenarioVariant): Plan;
  /** read a finished run and assemble the outlay it reads from it (text and references, never a new number) */
  read(run: RunRecord): Outlay;
  /** request a parameter change through the framework rules: a logged scenario variant, never a direct edit */
  requestVariant(base: ScenarioSpec, changes: ParameterChange[], reason: string): ScenarioVariant;
}

/** What the Meta Mind assembles from runs: references to numbers that exist in the run, never numbers of its own. */
export interface Outlay {
  run_id: string;
  summary: string;
  references: { label: string; run_id: string; path: string }[];
  proposals: SignOffItemInput[];
}

/* ---------------------------------------------------------------- sign-off queue */

export type SignOffKind = "policy_finding" | "registry_edit" | "calibration_claim" | "chain_sign_off";

export interface SignOffItemInput {
  kind: SignOffKind;
  title: string;
  /** the proposer's reasoning, attached verbatim */
  reasoning: string;
  /** what approval would do, machine-readable (e.g. the registry version id to approve, the model id to sign off) */
  payload: Record<string, unknown>;
  proposed_by: string;
}

export interface SignOffItem extends SignOffItemInput {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}
