export type Grounding = "solid_direct" | "reasoned_extrapolation" | "placeholder_needs_calibration";

/** A numeric value as it lives in the data files: never a bare number. */
export interface Param {
  label?: string;
  value: number;
  low?: number;
  high?: number;
  unit: string;
  grounding: Grounding;
  citations?: string[];
  note?: string;
  /** Which end of [low, high] protects more — lets the model report bounds. */
  moreProtective?: "higher" | "lower";
  /** Hazard inputs: which end of [low, high] gives the larger hazard (audit M4: hazard inputs enter the bounds). */
  moreHazardous?: "higher" | "lower";
}

export type Bound = "low" | "central" | "high";

export type HazardComponent = "wave" | "level" | "fluvial" | "rain";
export type ScenarioId = "surge" | "flood" | "compound" | "rain" | "slr";

export type EffectKind =
  | "wave_attenuation_per_100m"
  | "level_attenuation_per_km"
  | "wave_transmission"
  | "crest_barrier"
  | "flood_storage"
  | "flood_storage_with_breach"
  // rain at high tide (audit M15): act on a creek catchment's volume balance
  | "rain_retention"
  | "rain_pumping"
  | "drain_capacity"
  | "backflow_gate";

export interface EffectDef {
  kind: EffectKind;
  params: Record<string, Param>;
}

export interface InstanceParamDef {
  key: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
  grounding: Grounding;
  note?: string;
  /** a choice rather than a number (e.g. which creek catchment a drainage measure serves) */
  options?: { value: number; label: string }[];
}

/** Physical setting of a segment's frontage (audit M3): decides which solutions can be sited there. */
export type Setting = "sandy_open_coast" | "rocky_coast" | "estuary_bank" | "creek" | "khazan";

export interface SolutionDef {
  id: string;
  /** settings where this solution can be placed; "khazan" matches any segment with khazan present */
  allowedSettings: Setting[];
  name: string;
  category: "nbs" | "engineered" | "hybrid";
  summary: string;
  hazardComponents: HazardComponent[];
  evidence: string;
  effects: EffectDef[];
  instanceParams: InstanceParamDef[];
  /** how "Place on map" captures geometry: one click (point) or two (a short line) */
  placeAs?: "point" | "line";
  /** IPCC AR6 WGII Ch3 Table SM3.3 global reference for the matching generic option, if any */
  ipccAr6Reference?: {
    row: string | null;
    technicalEconomic?: string;
    institutionalGeophysical?: string;
    socioEcological?: string;
    general?: string;
    effectiveness?: string;
    mappingGrounding?: Grounding;
    mappingNote: string;
    citations: string[];
  };
}

/** One solution placed on one segment, in the baseline or a scenario. */
export interface Placement {
  id: string;
  solutionId: string;
  segmentId: string;
  params: Record<string, number>;
  /** Existing (baseline) measure derived from the data, vs. one the user added. */
  existing?: boolean;
  /** Grounding of the existing measure's derived size, shown in the UI. */
  derivedNote?: string;
  /**
   * Where the user placed it on the map (lon/lat). Display and planning only:
   * the model still applies the measure at the segment level (segmentId).
   */
  geometry?: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: [number, number][] };
}

export interface HazardParams {
  highTideReferenceM: Param;
  springHighWaterM: Param;
  lambdaWavePerKm: Param;
  lambdaFluvialPerKm: Param;
  overlandAttenuationMPerKm: Param;
  bundCrestM: Param;
  rainBurstHours: Param;
  outfallInvertM: Param;
  runoffCoefImpervious: Param;
  runoffCoefPervious: Param;
  drainCapacityMmPerH: Param;
}

/** Return period (years) of the storm tide and river stage (audit M5). */
export type ReturnPeriod = 1 | 10 | 50 | 100;

export interface SegmentDef {
  id: string;
  name: string;
  side: "north" | "south" | "any";
  boxes: [number, number, number, number][];
  description: string;
  excludeKhazan?: string;
  /** physical setting of the frontage, derived from the CRZ grid and confirmed by hand (caseStudyAreas.json) */
  setting: Setting;
  khazanPresent: boolean;
  settingNote: string;
}

/** Everything the model derives for a segment from the CRZ grid. */
export interface SegmentStats {
  id: string;
  shoreCells: number[];
  bandCells: number[];
  shorelineKm: number;
  /** km² by CRZ class code within the hinterland band. */
  classAreaKm2: Record<string, number>;
  khazanKm2: number;
  lowLyingKm2: number;
  mangroveBeltM: number;
  centroid: [number, number];
}

export interface SegmentHazard {
  wave: number;
  level: number;
  fluvial: number;
}

/**
 * What is exposed in a segment's hinterland. Since Phase 2 (audit M14) mangrove and khazan land are not
 * exposure: flooded mangrove is habitat, and khazan is reported as bund overtopping / failure on the ecology card.
 */
export interface Exposure {
  urbanKm2: number;
  ruralCrzKm2: number;
  /** people (GHS-POP 2020 in the hinterland band, unless the user entered a figure) */
  population: number | null;
  /** building footprints (OSM + Microsoft) in the hinterland band */
  buildings: number;
}
