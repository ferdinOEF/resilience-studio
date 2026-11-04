/**
 * The contracts of the ported chain: water level -> damage -> people -> loss (spec section 8, step 4).
 * Grids are the Panjim CRZ grid of the place pack: EPSG:4326, cells of 0.0005 degree (about 55 m), the study scope mask.
 * Nothing numeric that the models compute with lives here; the registry holds every parameter.
 */
import type { Handoff } from "./validate";
import { parseContract, type ModelContract } from "./schema";

const CELL_M = 55;
const GRID = { resolution_m: CELL_M, extent: "scope" as const, extent_rule: "the place pack's study scope mask on the CRZ grid (EPSG:4326, 0.0005 degree cells)" };
const SEG = { resolution_m: null, extent: "segment" as const, extent_rule: "one row per coastline segment of the place pack, plus the scope total" };
const NONE = { resolution_m: null, extent: "none" as const, extent_rule: "" };

export const WATER_LEVEL: ModelContract = parseContract({
  id: "water-level",
  name: "Water level (one level in metres, bathtub spread with barriers)",
  version: "1.0.0",
  kind: "physical",
  description: "WL = MHHW + SLR + storm surge(RP) + river stage(x, RP) - mangrove attenuation - storage; spread over connected land; barriers hold up to their crest; depth = WL - ground. Ported from coastal-resilience-studio (model audit P1).",
  inputs: [
    { name: "hazard_parameters", quantity: "hazard_parameters", unit: "mixed (registry units)", crs: "none", dtype: "table", grid: NONE, timestep: "event", valid_range: [null, null], required: true, description: "MHHW, spring HW, storm tide at RP, river stage at RP, decay rates, bund crest, rain inputs: resolved from the registry for the place" },
    { name: "terrain", quantity: "ground_elevation_above_msl", unit: "m", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "none", valid_range: [-5, 100], required: true, description: "DeltaDTM v1.1 by default (GLO-30 above 10 m)" },
    { name: "crz_classes", quantity: "crz_class", unit: "class", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "none", valid_range: [null, null], required: true },
    { name: "sea_level_rise", quantity: "sea_level_rise", unit: "m", crs: "none", dtype: "scalar", grid: NONE, timestep: "horizon", valid_range: [0, 3], required: true },
    { name: "measures", quantity: "measure_placements", unit: "n/a", crs: "EPSG:4326", dtype: "vector", grid: { resolution_m: null, extent: "segment", extent_rule: "placements on the place pack's segments" }, timestep: "none", valid_range: [null, null], required: false }
  ],
  outputs: [
    { name: "water_level", quantity: "water_level_above_msl", unit: "m", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [-1, 10], required: true },
    { name: "depth", quantity: "depth_above_ground", unit: "m", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 10], required: true, description: "max(0, water level - ground) on flooded and behind-bund cells" },
    { name: "extent_classes", quantity: "inundation_class", unit: "class", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 3], required: true, description: "0 dry, 1 wet at every high tide, 2 behind bunds, 3 newly flooded" },
    { name: "shoreline_water_level", quantity: "water_level_above_msl", unit: "m", crs: "none", dtype: "table", grid: SEG, timestep: "event", valid_range: [-1, 10], required: true }
  ],
  applicability: { levels: ["city", "site"], conditions: ["a place pack with a CRZ grid, terrain and segments", "estuarine or open coast; not for river reaches above tidal influence"] },
  routing: [
    { output: "depth", to_model: "damage", to_input: "depth", transform: {} },
    { output: "depth", to_model: "people", to_input: "depth", transform: {} },
    { output: "extent_classes", to_model: "damage", to_input: "extent_classes", transform: {} },
    { output: "extent_classes", to_model: "people", to_input: "extent_classes", transform: {} }
  ],
  uncertainty: { kind: "band", description: "three runs: central, least favourable and most favourable ends of every ranged input (hazard, SLR, measures)" },
  calibration: { status: "uncalibrated", events: [], signed_off_by: null, signed_off_at: null },
  registry_dependencies: ["hazards.*", "solutions.*", "areas.*", "datasets.dem", "datasets.crzGrid", "defenses"],
  agent: { runner: "in-process:@resilience/core.runEvent", retries: 1, timeout_s: 60 },
  grounding: "reasoned_extrapolation"
});

export const DAMAGE: ModelContract = parseContract({
  id: "damage",
  name: "Direct damage (depth-damage curves, Huizinga et al. 2017, India maximum damage)",
  version: "1.0.0",
  kind: "economic",
  description: "damage = sum over cells and asset classes of exposure x maximum damage x factor(depth). Ported from coastal-resilience-studio (model audit P2, M12).",
  inputs: [
    { name: "depth", quantity: "depth_above_ground", unit: "m", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 10], required: true },
    { name: "extent_classes", quantity: "inundation_class", unit: "class", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 3], required: true },
    { name: "exposure", quantity: "built_exposure", unit: "m2 per cell (ha for farmland)", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "none", valid_range: [0, null], required: true, description: "OSM + Microsoft footprints by class, road surface, farmland" },
    { name: "damage_parameters", quantity: "damage_parameters", unit: "mixed (registry units)", crs: "none", dtype: "table", grid: NONE, timestep: "none", valid_range: [null, null], required: true }
  ],
  outputs: [
    { name: "damage_by_segment", quantity: "direct_damage", unit: "INR", crs: "none", dtype: "table", grid: SEG, timestep: "event", valid_range: [0, null], required: true },
    { name: "damage_total", quantity: "direct_damage", unit: "INR", crs: "none", dtype: "scalar", grid: NONE, timestep: "event", valid_range: [0, null], required: true },
    { name: "buildings_wet", quantity: "building_count", unit: "buildings", crs: "none", dtype: "scalar", grid: NONE, timestep: "event", valid_range: [0, null], required: true }
  ],
  applicability: { levels: ["city", "site"], conditions: ["exposure grids aligned with the water-level grid"] },
  routing: [{ output: "damage_total", to_model: "loss", to_input: "damage_by_return_period", transform: { timestep: "event_to_annual_trapezoid", aggregation: "none", note: "one event per return period becomes one row" } }],
  uncertainty: { kind: "band", description: "maximum damage at the ends of its range for the least and most favourable runs" },
  calibration: { status: "uncalibrated", events: [], signed_off_by: null, signed_off_at: null },
  registry_dependencies: ["damage.*", "datasets.exposureGrid"],
  agent: { runner: "in-process:@resilience/core.impactOf", retries: 1, timeout_s: 30 },
  grounding: "reasoned_extrapolation"
});

export const PEOPLE: ModelContract = parseContract({
  id: "people",
  name: "People affected (gridded population over a depth threshold, by social vulnerability class)",
  version: "1.0.0",
  kind: "social",
  description: "people affected = sum of people in cells with depth above the threshold; grouped by SVI class. Ported from coastal-resilience-studio (model audit P2, A8).",
  inputs: [
    { name: "depth", quantity: "depth_above_ground", unit: "m", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 10], required: true },
    { name: "extent_classes", quantity: "inundation_class", unit: "class", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "event", valid_range: [0, 3], required: true },
    { name: "population", quantity: "population", unit: "people per cell", crs: "EPSG:4326", dtype: "grid", grid: GRID, timestep: "none", valid_range: [0, null], required: true, description: "GHS-POP 2020 rescaled to Census 2011 town totals" },
    { name: "people_parameters", quantity: "people_parameters", unit: "mixed (registry units)", crs: "none", dtype: "table", grid: NONE, timestep: "none", valid_range: [null, null], required: true }
  ],
  outputs: [
    { name: "people_by_segment", quantity: "people_affected", unit: "people", crs: "none", dtype: "table", grid: SEG, timestep: "event", valid_range: [0, null], required: true },
    { name: "people_total", quantity: "people_affected", unit: "people", crs: "none", dtype: "scalar", grid: NONE, timestep: "event", valid_range: [0, null], required: true },
    { name: "people_by_svi", quantity: "people_affected", unit: "people", crs: "none", dtype: "table", grid: { resolution_m: null, extent: "none", extent_rule: "one row per SVI class" }, timestep: "event", valid_range: [0, null], required: true }
  ],
  applicability: { levels: ["city", "site"], conditions: ["population grid aligned with the water-level grid"] },
  routing: [{ output: "people_total", to_model: "loss", to_input: "people_by_return_period", transform: { timestep: "event_to_annual_trapezoid", note: "one event per return period becomes one row" } }],
  uncertainty: { kind: "band", description: "carried from the water level's three runs" },
  calibration: { status: "uncalibrated", events: [], signed_off_by: null, signed_off_at: null },
  registry_dependencies: ["damage.peopleAffectedDepthM", "datasets.popGrid", "svi", "areas.panjim_mandovi_pilot.population*"],
  agent: { runner: "in-process:@resilience/core.impactOf", retries: 1, timeout_s: 30 },
  grounding: "reasoned_extrapolation"
});

export const LOSS: ModelContract = parseContract({
  id: "loss",
  name: "Expected annual loss (trapezoid over return periods)",
  version: "1.0.0",
  kind: "economic",
  description: "EAD = sum over consecutive return periods of 0.5 (D_k + D_k+1)(p_k - p_k+1), p = 1/RP; the same for people per year. Ported from coastal-resilience-studio (model audit P2, M13).",
  inputs: [
    { name: "damage_by_return_period", quantity: "direct_damage", unit: "INR", crs: "none", dtype: "table", grid: { resolution_m: null, extent: "none", extent_rule: "one row per return period" }, timestep: "annual", valid_range: [0, null], required: true },
    { name: "people_by_return_period", quantity: "people_affected", unit: "people", crs: "none", dtype: "table", grid: { resolution_m: null, extent: "none", extent_rule: "one row per return period" }, timestep: "annual", valid_range: [0, null], required: true }
  ],
  outputs: [
    { name: "expected_annual_damage", quantity: "expected_annual_damage", unit: "INR per year", crs: "none", dtype: "scalar", grid: NONE, timestep: "annual", valid_range: [0, null], required: true },
    { name: "people_per_year", quantity: "expected_people_affected", unit: "people per year", crs: "none", dtype: "scalar", grid: NONE, timestep: "annual", valid_range: [0, null], required: true }
  ],
  applicability: { levels: ["global", "national", "state", "city", "site"], conditions: ["at least two return periods"] },
  routing: [],
  uncertainty: { kind: "band", description: "each band's events integrate separately" },
  calibration: { status: "uncalibrated", events: [], signed_off_by: null, signed_off_at: null },
  registry_dependencies: [],
  agent: { runner: "in-process:@resilience/core.expectedAnnual", retries: 0, timeout_s: 10 },
  grounding: "solid_direct"
});

export const PORTED_CHAIN_CONTRACTS: ModelContract[] = [WATER_LEVEL, DAMAGE, PEOPLE, LOSS];

/** The hand-offs the Liaison performs for one question (per return period, then the annual integration). */
export const PORTED_CHAIN_HANDOFFS: Handoff[] = [
  { from_model: "water-level", output: "depth", to_model: "damage", input: "depth" },
  { from_model: "water-level", output: "extent_classes", to_model: "damage", input: "extent_classes" },
  { from_model: "water-level", output: "depth", to_model: "people", input: "depth" },
  { from_model: "water-level", output: "extent_classes", to_model: "people", input: "extent_classes" },
  { from_model: "damage", output: "damage_total", to_model: "loss", input: "damage_by_return_period" },
  { from_model: "people", output: "people_total", to_model: "loss", input: "people_by_return_period" }
];
