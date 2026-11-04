/**
 * Model contract (spec section 2). Every model in the mesh has one. The validator (validate.ts) rejects any hand-off
 * whose source output and target input do not match on quantity, unit, CRS, grid, time step and range after the
 * declared transform.
 */
import { z } from "zod";

export const MODEL_KINDS = ["physical", "ecological", "social", "economic", "policy", "stand-in"] as const;
export const GROUNDINGS = ["solid_direct", "reasoned_extrapolation", "placeholder_needs_calibration"] as const;
export const CALIBRATION_STATUSES = ["uncalibrated", "calibrated", "signed_off"] as const;
export const LEVELS = ["global", "national", "state", "city", "site"] as const;
export const DTYPES = ["grid", "scalar", "table", "vector", "mask"] as const;
export const EXTENTS = ["scope", "segment", "catchment", "point", "none"] as const;
export const TIMESTEPS = ["none", "event", "hourly", "daily", "annual", "horizon"] as const;

export const GridSchema = z.object({
  /** cell size in metres on the ground; null for non-gridded data */
  resolution_m: z.number().positive().nullable(),
  /** what the data covers */
  extent: z.enum(EXTENTS),
  /** rule the extent must satisfy, e.g. "the study scope mask of the place pack" */
  extent_rule: z.string()
});

export const PortSchema = z.object({
  name: z.string().min(1),
  /** the physical or social quantity, e.g. "depth_above_ground"; two ports only connect when their quantities match */
  quantity: z.string().min(1),
  unit: z.string(),
  /** "EPSG:4326" and so on, or "none" for non-spatial data */
  crs: z.string(),
  dtype: z.enum(DTYPES),
  grid: GridSchema,
  timestep: z.enum(TIMESTEPS),
  /** [min, max], null for an open end */
  valid_range: z.tuple([z.number().nullable(), z.number().nullable()]),
  required: z.boolean(),
  description: z.string().default("")
});
export type Port = z.infer<typeof PortSchema>;

export const TransformSchema = z.object({
  regrid: z.enum(["none", "nearest", "bilinear", "aggregate_sum", "aggregate_mean", "aggregate_max"]).default("none"),
  reproject: z.object({ from: z.string(), to: z.string() }).nullable().default(null),
  unit_conversion: z.object({ from: z.string(), to: z.string(), factor: z.number() }).nullable().default(null),
  /** how several sources combine on the same input */
  merge: z.enum(["none", "max_water_level", "sum", "mean"]).default("none"),
  /** time-step alignment, e.g. events at several return periods integrate to an annual expectation */
  timestep: z.enum(["none", "event_to_annual_trapezoid", "hourly_to_event_max"]).default("none"),
  /** aggregation from cells to segments, catchments or a scalar */
  aggregation: z.enum(["none", "sum", "mean", "max", "count"]).default("none"),
  note: z.string().default("")
});
export type Transform = z.infer<typeof TransformSchema>;

export const RoutingRuleSchema = z.object({
  /** this model's output */
  output: z.string(),
  to_model: z.string(),
  to_input: z.string(),
  transform: TransformSchema
});
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export const CalibrationEventSchema = z.object({
  event: z.string(),
  date: z.string(),
  /** metric name -> value, e.g. {"extent_hit_rate": 0.8} */
  metrics: z.record(z.string(), z.number()),
  note: z.string().default("")
});

export const ModelContractSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  version: z.string().min(1),
  kind: z.enum(MODEL_KINDS),
  inputs: z.array(PortSchema),
  outputs: z.array(PortSchema),
  applicability: z.object({ levels: z.array(z.enum(LEVELS)), conditions: z.array(z.string()) }),
  routing: z.array(RoutingRuleSchema),
  uncertainty: z.object({ kind: z.enum(["band", "ensemble", "class"]), description: z.string() }),
  calibration: z.object({
    status: z.enum(CALIBRATION_STATUSES),
    events: z.array(CalibrationEventSchema),
    signed_off_by: z.string().nullable().default(null),
    signed_off_at: z.string().nullable().default(null)
  }),
  /** registry entry ids the model reads; prefixes ending in "*" match every entry under that path */
  registry_dependencies: z.array(z.string()),
  agent: z.object({ runner: z.string(), retries: z.number().int().min(0), timeout_s: z.number().positive() }),
  /** admin-side only */
  grounding: z.enum(GROUNDINGS),
  description: z.string().default("")
});
export type ModelContract = z.infer<typeof ModelContractSchema>;

export function parseContract(json: unknown): ModelContract {
  return ModelContractSchema.parse(json);
}

export function modelContractJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ModelContractSchema, { target: "draft-7" }) as Record<string, unknown>;
}
