/**
 * Shapes of the runs, models, scenario-library and sign-off APIs (apps/api/src/routes/{runs,models,signoff}.ts),
 * restated from packages/meta-mind/src/types.ts and packages/contracts/src/schema.ts: the studio imports neither package.
 */
import type { Grounding } from "../api";

export const HAZARDS = ["surge", "flood", "compound", "rain"] as const;
export const RETURN_PERIODS = [1, 10, 50, 100] as const;
export const HORIZONS = ["today", "2050", "2100"] as const;
export const PATHWAYS = ["ssp126", "ssp245", "ssp585"] as const;
export const BOUNDS = ["low", "central", "high"] as const;
/** chain order of the ported chain: water level -> damage -> people -> loss */
export const CHAIN_ORDER = ["water-level", "damage", "people", "loss"] as const;

export type Hazard = (typeof HAZARDS)[number];
export type ReturnPeriod = (typeof RETURN_PERIODS)[number];
export type Horizon = (typeof HORIZONS)[number];
export type Pathway = (typeof PATHWAYS)[number];
export type Bound = (typeof BOUNDS)[number];
export type Bounds = Record<Bound, number>;
export type RunStatus = "planned" | "running" | "ok" | "failed";
export type CalibrationStatus = "uncalibrated" | "calibrated" | "signed_off";

export interface ScenarioSpec {
  place: string;
  hazard: Hazard;
  return_periods: ReturnPeriod[];
  horizon: Horizon;
  pathway: Pathway;
  solution_set: { id: string; label: string; placements: unknown[] };
  bunds_failed?: boolean;
}

export interface Transform {
  regrid: string;
  reproject: { from: string; to: string } | null;
  unit_conversion: { from: string; to: string; factor: number } | null;
  merge: string;
  timestep: string;
  aggregation: string;
  note: string;
}

export interface HandoffSpec {
  from_model: string;
  output: string;
  to_model: string;
  input: string;
  transform?: Partial<Transform>;
}

export interface PlanStep {
  model: string;
  return_period?: ReturnPeriod;
  inputs_from: HandoffSpec[];
}

export interface Plan {
  id: string;
  question: string;
  scenario: ScenarioSpec;
  variant?: { id: string; reason: string; changes: { registry_id: string; from: number; to: number }[] };
  steps: PlanStep[];
  handoffs: HandoffSpec[];
  created_at: string;
  created_by: string;
}

export interface LogEntry {
  t: string;
  who: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface HandoffRecord {
  ok: boolean;
  errors: { code: string; message: string }[];
  from: { model: string; output: string };
  to: { model: string; input: string };
  transform: Transform;
  /** 0 = the plan check before anything ran */
  step: number;
  return_period?: ReturnPeriod;
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
  outputs: Partial<Record<Bound, Record<string, unknown>>>;
  anomalies: string[];
}

export interface RunResult {
  totals: { flooded_km2: Bounds; bunded_km2: Bounds; people_affected: Bounds; damage_inr: Bounds; buildings_wet: Bounds };
  headline_return_period: ReturnPeriod;
  per_segment: { id: string; shoreline_wl_m: Bounds; flooded_km2: Bounds; people: number | null; damage_inr: number | null; flags: string[] }[];
  annual: { ead_inr: Bounds; people_per_year: Bounds } | null;
  by_return_period: { rp: ReturnPeriod; damage_inr: Bounds; people: Bounds }[];
  depth_cell_count?: number;
}

export interface RegistryVersionUsed {
  id: string;
  version_id: string;
  level_used: string;
  status: string;
}

interface RunBase {
  id: string;
  created_at: string;
  requested_by: string;
  plan: Plan;
  status: RunStatus;
  contracts: { id: string; version: string; calibration_status: string }[];
  registry_versions: RegistryVersionUsed[];
  error: string | null;
  stale: boolean;
  chain_signed_off: boolean;
  duration_ms: number;
}

/** GET /api/runs -> {runs: RunSummary[]}; POST /api/runs returns the same shape as `run`. */
export interface RunSummary extends RunBase {
  steps: number;
  handoffs: { total: number; failed: number };
  log_entries: number;
  result: Pick<RunResult, "totals" | "headline_return_period" | "per_segment" | "annual" | "by_return_period"> | null;
}

/** GET /api/runs/:id -> {run: RunRecord, outlay}; depth cells are left out unless ?cells=1. */
export interface RunRecord extends RunBase {
  steps: StepRecord[];
  handoffs: HandoffRecord[];
  log: LogEntry[];
  result: RunResult | null;
}

export interface Outlay {
  run_id: string;
  summary: string;
  references: { label: string; run_id: string; path: string }[];
  proposals: unknown[];
}

export interface LibraryCell {
  key: string;
  hazard: Hazard;
  horizon: Horizon;
  pathway: Pathway;
  solution_set: string;
  run_id: string | null;
  status: "pre-run" | "stale" | "missing";
  chain_signed_off: boolean;
}

export interface LibraryResponse {
  place: string;
  dimensions: { hazards: Hazard[]; return_periods: ReturnPeriod[]; horizons: Horizon[]; pathways: Pathway[]; solution_sets: string[] };
  cells: LibraryCell[];
  counts: { total: number; pre_run: number; stale: number; missing: number };
}

export interface Port {
  name: string;
  quantity: string;
  unit: string;
  crs: string;
  dtype: "grid" | "scalar" | "table" | "vector" | "mask";
  grid: { resolution_m: number | null; extent: string; extent_rule: string };
  timestep: string;
  valid_range: [number | null, number | null];
  required: boolean;
  description: string;
}

export interface CalibrationEvent {
  event: string;
  date: string;
  metrics: Record<string, number>;
  note: string;
}

export interface Calibration {
  status: CalibrationStatus;
  events: CalibrationEvent[];
  signed_off_by: string | null;
  signed_off_at: string | null;
}

export interface ModelContract {
  id: string;
  name: string;
  version: string;
  kind: string;
  inputs: Port[];
  outputs: Port[];
  applicability: { levels: string[]; conditions: string[] };
  routing: { output: string; to_model: string; to_input: string; transform: Transform }[];
  uncertainty: { kind: string; description: string };
  calibration: Calibration;
  registry_dependencies: string[];
  agent: { runner: string; retries: number; timeout_s: number };
  grounding: Grounding;
  description: string;
}

export interface Gate {
  signed_off: boolean;
  missing: string[];
  unapproved: string[];
}

/** GET /api/models -> {models: ModelSummary[], chain, writes}. */
export interface ModelSummary {
  id: string;
  name: string;
  version: string;
  kind: string;
  grounding: Grounding;
  calibration: Calibration;
  inputs: number;
  outputs: number;
  routing: number;
  agent: { runner: string; retries: number; timeout_s: number };
  registry_dependencies: { declared: string[]; resolved: number; approved: number; unapproved: string[]; missing: string[] };
  gate: { signed_off: boolean; blocked_by: string[]; unapproved_count: number };
  health: string;
}

export interface ModelsList {
  models: ModelSummary[];
  chain: { ok: boolean; handoffs: number; failing: number };
  writes: { ok: boolean; reason?: string };
}

export const SIGNOFF_KINDS = ["policy_finding", "registry_edit", "calibration_claim", "chain_sign_off"] as const;
export type SignOffKind = (typeof SIGNOFF_KINDS)[number];
export type SignOffStatus = "pending" | "approved" | "rejected";

export interface SignOffItem {
  id: string;
  kind: SignOffKind;
  title: string;
  reasoning: string;
  payload: Record<string, unknown>;
  proposed_by: string;
  status: SignOffStatus;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface SignOffList {
  items: SignOffItem[];
  counts: { pending: number };
}
