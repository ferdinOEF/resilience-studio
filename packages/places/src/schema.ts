/**
 * Place-pack manifest (spec section 4): a folder per place with a manifest that lists every layer, its source, level and
 * status. National base data has the same shape at level national. Nothing here is a model parameter; the registry
 * holds those. A layer's grounding and admin_only flag decide whether the studio may draw it.
 */
import { z } from "zod";

export const LAYER_KINDS = ["boundary", "zones", "terrain", "raster", "vector", "points", "table", "document", "events", "grid"] as const;
export const LAYER_STATUSES = ["supplied", "derived", "placeholder", "not_yet_supplied"] as const;

export const LayerSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  title: z.string(),
  kind: z.enum(LAYER_KINDS),
  /** path under the pack folder; null when the data is not in the repo (external store or not yet supplied) */
  file: z.string().nullable(),
  format: z.string(),
  crs: z.string(),
  source: z.string(),
  source_type: z.enum(["peer_reviewed", "un_giz_report", "government_doc", "official_dataset", "field_survey", "expert_elicitation"]),
  citation_ids: z.array(z.string()).default([]),
  level: z.enum(["global", "national", "state", "city", "site"]),
  grounding: z.enum(["solid_direct", "reasoned_extrapolation", "placeholder_needs_calibration"]),
  status: z.enum(LAYER_STATUSES),
  /** placeholder layers never reach the studio; they are admin-only until replaced */
  admin_only: z.boolean().default(false),
  /** what replaces or confirms this layer */
  replaced_by: z.string().nullable().default(null),
  note: z.string().default("")
});
export type Layer = z.infer<typeof LayerSchema>;

export const CalibrationEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  hazard: z.string(),
  /** observed extents or levels: what has been supplied, if anything */
  observations: z.array(z.object({ kind: z.string(), source: z.string(), file: z.string().nullable(), status: z.enum(LAYER_STATUSES) })),
  status: z.enum(["observations_pending", "ready", "calibrated"])
});

export const PolicyInstrumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  year: z.number().int().nullable(),
  kind: z.enum(["notification", "act", "plan", "rules", "code", "bye-law"]),
  /** PDF in the pack, or null until supplied */
  file: z.string().nullable(),
  url: z.string().nullable(),
  status: z.enum(["supplied", "public_not_fetched", "not_yet_supplied"]),
  applicability: z.enum(["confirmed", "to_confirm_clause_by_clause"])
});

export const ManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(["national", "state", "city"]),
  /** registry geography ids this pack applies to, most local first */
  geography: z.object({ city: z.string().optional(), state: z.string().optional(), national: z.string() }),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  description: z.string(),
  layers: z.array(LayerSchema),
  calibration_events: z.array(CalibrationEventSchema).default([]),
  policy_corpus: z.array(PolicyInstrumentSchema).default([]),
  /** national base data this pack overrides where it has better data */
  overrides_national: z.array(z.string()).default([]),
  updated_at: z.string()
});
export type Manifest = z.infer<typeof ManifestSchema>;
export type CalibrationEvent = z.infer<typeof CalibrationEventSchema>;
export type PolicyInstrument = z.infer<typeof PolicyInstrumentSchema>;
