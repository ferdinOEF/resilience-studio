/**
 * Shapes the studio reads from the API (apps/api/src/routes/{places,runs,solutions}.ts). The run, model and registry
 * shapes are shared with the admin side (../admin/types.ts, ../api.ts); only the place, gate, solutions and policy
 * shapes are restated here.
 */
import type { FeatureCollection } from "geojson";
import type { Grounding, Level, SourceType } from "../api";
import type { Hazard, Horizon, Pathway, ReturnPeriod, RunSummary } from "../admin/types";

/** GET /api/runs/studio/panjim: the gate. modelled is true only when a signed-off, non-stale do-nothing run exists per hazard. */
export interface Gate {
  place: string;
  modelled: boolean;
  reason: string | null;
  runs?: Partial<Record<Hazard, RunSummary>>;
}

export interface PlaceSummary {
  id: string;
  name: string;
  level: "national" | "state" | "city";
  layers: number;
  updated_at: string;
}

export type LayerStatus = "supplied" | "derived" | "placeholder" | "not_yet_supplied";

export interface LayerInfo {
  id: string;
  title: string;
  kind: string;
  file: string | null;
  format: string;
  crs: string;
  source: string;
  source_type: SourceType;
  citation_ids: string[];
  level: Level;
  grounding: Grounding;
  status: LayerStatus;
  admin_only: boolean;
  replaced_by: string | null;
  note: string;
}

export interface PolicyInstrument {
  id: string;
  title: string;
  issuer: string;
  year: number | null;
  kind: string;
  file: string | null;
  url: string | null;
  status: "supplied" | "public_not_fetched" | "not_yet_supplied";
  applicability: "confirmed" | "to_confirm_clause_by_clause";
}

export interface CalibrationEventInfo {
  id: string;
  name: string;
  date: string;
  hazard: string;
  observations: { kind: string; source: string; file: string | null; status: LayerStatus }[];
  status: "observations_pending" | "ready" | "calibrated";
}

export interface Manifest {
  id: string;
  name: string;
  level: "national" | "state" | "city";
  geography: { city?: string; state?: string; national: string };
  bbox: [number, number, number, number];
  description: string;
  layers: LayerInfo[];
  calibration_events: CalibrationEventInfo[];
  policy_corpus: PolicyInstrument[];
  overrides_national: string[];
  updated_at: string;
}

export interface InventoryRow {
  id: string;
  title: string;
  status: LayerStatus;
  grounding: Grounding;
  admin_only: boolean;
  replaced_by: string | null;
}

export interface PlaceResponse {
  manifest: Manifest;
  studio_layers: string[];
  inventory: InventoryRow[];
}

export interface LayerResponse {
  layer: LayerInfo;
  data: FeatureCollection;
}

export interface CrzResponse {
  classes: Record<string, string>;
  grounding: string;
  source: string;
  data: FeatureCollection;
}

export interface ExtentResponse {
  run_id: string;
  return_period: ReturnPeriod | null;
  bound: "central";
  depth_band_m: number;
  data: FeatureCollection;
}

export interface ZoneStats {
  id: string;
  name: string;
  cells: number;
  people_total: number;
  buildings_total: number;
  flooded_cells: number;
  flooded_km2: number;
  bunded_km2: number;
  people_in_flood: number;
  buildings_in_flood: number;
  depth_mean_m: number | null;
  depth_max_m: number | null;
  people_share: number;
  svi_higher_share: number;
  rank: number;
  rank_class: 1 | 2 | 3 | 4;
}

export interface ZonesResponse {
  run_id: string;
  layer: LayerInfo;
  method: string;
  zones: ZoneStats[];
}

/** One effect or instance parameter of a solution, as the registry resolves it (value null = not in the approved registry). */
export interface SolutionParam {
  registry_id: string;
  value: number | null;
  low: number | null;
  high: number | null;
  unit: string;
  grounding: Grounding | string;
  level_used: string | null;
  level_label?: string;
  status: string;
  version_id?: string;
  citation_ids: string[];
  citation?: string;
  label: string;
}

export interface InstanceParam extends SolutionParam {
  key: string;
  step: number | null;
  options: { value: number; label: string }[] | null;
  note: string | null;
}

export interface IpccReference {
  row: string;
  technicalEconomic: string;
  institutionalGeophysical: string;
  socioEcological: string;
  general: string;
  effectiveness: string;
  mappingGrounding: string;
  mappingNote: string;
  citations: string[];
}

export type SolutionCategory = "nbs" | "engineered" | "hybrid";

export interface Solution {
  id: string;
  name: string;
  category: SolutionCategory;
  summary: string;
  evidence: string;
  hazard_components: string[];
  allowed_settings: string[];
  allowed_segments: string[];
  place_as: "point" | "line" | null;
  effects: { kind: string; params: Record<string, SolutionParam> }[];
  instance_params: InstanceParam[];
  ipcc_ar6_reference: IpccReference | null;
}

export interface SegmentDef {
  id: string;
  name: string;
  setting: string;
  khazanPresent: boolean;
  settingNote?: string;
}

export interface SolutionsResponse {
  solutions: Solution[];
  segments: SegmentDef[];
  rubric: unknown;
  citations: Record<string, { short: string; full: string }>;
  admin: boolean;
}

export interface ClauseMap {
  place: string;
  note: string;
  states: Record<string, string>;
  instruments: { id: string; short: string; title: string }[];
  risks: { id: string; title: string; chain_hazard: string }[];
  cells: { risk: string; instrument: string; state: string; clause_ids?: string[]; finding_ids?: string[] }[];
  default_state: string;
  clauses: { id: string; instrument: string; ref: string; text: string }[];
  findings: { id: string; risk: string; instrument: string; status: string; text: string }[];
}

/** A solution placed on the map. lon/lat are where the user clicked (UI only); the run takes id, solutionId, segmentId, params. */
export interface Placement {
  id: string;
  solutionId: string;
  segmentId: string;
  params: Record<string, number>;
  lon: number;
  lat: number;
}

export interface SolutionSet {
  id: string;
  label: string;
  placements: Placement[];
}

export const DO_NOTHING: SolutionSet = { id: "do-nothing", label: "do nothing (today's measures)", placements: [] };

/** What the studio builds a scenario from; horizon follows the year (≤2035 today, ≤2075 2050, else 2100). */
export interface ScenarioChoice {
  hazard: Hazard;
  rp: 10 | 50 | 100;
  year: number;
  pathway: Pathway;
}

export function horizonOf(year: number): Horizon {
  return year <= 2035 ? "today" : year <= 2075 ? "2050" : "2100";
}

export const STUDIO_HAZARD_LABEL: Record<Hazard, string> = { surge: "Cyclone + surge", flood: "Monsoon river flood", compound: "Compound surge + river flood", rain: "Heavy rain at high tide" };
export const STUDIO_HORIZON_LABEL: Record<Horizon, string> = { today: "today", "2050": "2050", "2100": "2100" };
export const RISK_CLASS_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Low", 2: "Moderate", 3: "High", 4: "Very high" };
