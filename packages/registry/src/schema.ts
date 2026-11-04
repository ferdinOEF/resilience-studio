/**
 * Science registry entry schema (spec section 3.1). One row per version: `id` is the stable identity of the parameter,
 * relationship, formula, index, threshold, curve or dataset reference, and `version` counts its versions.
 */
import { z } from "zod";

export const GROUNDINGS = ["solid_direct", "reasoned_extrapolation", "placeholder_needs_calibration"] as const;
export const LEVELS = ["global", "national", "state", "city", "site"] as const;
export const SOURCE_TYPES = ["peer_reviewed", "un_giz_report", "government_doc", "official_dataset", "field_survey", "expert_elicitation"] as const;
export const STATUSES = ["draft", "in_review", "approved", "superseded"] as const;
export const KINDS = ["parameter", "relationship", "formula", "index", "threshold", "curve", "dataset_ref"] as const;

export type Grounding = (typeof GROUNDINGS)[number];
export type Level = (typeof LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type EntryKind = (typeof KINDS)[number];

/** A scalar with an optional range, a table (rows of named values), an expression (formula text) or a dataset reference. */
export const ValueSchema = z.union([
  z.object({ type: z.literal("scalar"), value: z.number(), low: z.number().optional(), high: z.number().optional() }),
  z.object({ type: z.literal("table"), columns: z.array(z.string()), rows: z.array(z.array(z.union([z.number(), z.string(), z.null()]))) }),
  z.object({ type: z.literal("expression"), expression: z.string() }),
  z.object({ type: z.literal("reference"), uri: z.string(), checksum: z.string().optional() })
]);
export type EntryValue = z.infer<typeof ValueSchema>;

export const SourceSchema = z.object({
  /** full citation text */
  citation: z.string().min(8),
  source_type: z.enum(SOURCE_TYPES),
  source_year: z.number().int().min(1800).max(2100).nullable(),
  /** URL or file reference */
  source_url: z.string().nullable(),
  /** page, table or figure reference */
  locator: z.string().nullable(),
  /** citation ids from the citation register, when the source is one of them */
  citation_ids: z.array(z.string()).default([])
});
export type Source = z.infer<typeof SourceSchema>;

export const EntrySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  /** `${id}@${version}` */
  version_id: z.string(),
  kind: z.enum(KINDS),
  label: z.string(),
  value: ValueSchema,
  unit: z.string(),
  valid_range: z.tuple([z.number().nullable(), z.number().nullable()]).nullable(),
  level: z.enum(LEVELS),
  /** id of the area the entry applies to: "global", "IN", "IN-GA", "IN-GA-panjim", or a site id */
  geography: z.string(),
  source: SourceSchema,
  grounding: z.enum(GROUNDINGS),
  note: z.string().nullable(),
  author: z.string(),
  reviewer: z.string().nullable(),
  review_note: z.string().nullable(),
  status: z.enum(STATUSES),
  created_at: z.string(),
  approved_at: z.string().nullable(),
  supersedes: z.string().nullable(),
  change_reason: z.string().nullable(),
  /** model ids and solution ids that read the entry (maintained automatically) */
  used_by: z.array(z.string()).default([])
});
export type RegistryEntry = z.infer<typeof EntrySchema>;

/** What a scientist submits for a new entry or a new version. The form refuses it without a citation and a source type. */
export const EntryInputSchema = z.object({
  id: z.string().min(1).regex(/^[A-Za-z0-9_.:-]+$/, "id: letters, digits, _ . : -"),
  kind: z.enum(KINDS),
  label: z.string().min(1),
  value: ValueSchema,
  unit: z.string(),
  valid_range: z.tuple([z.number().nullable(), z.number().nullable()]).nullable().default(null),
  level: z.enum(LEVELS),
  geography: z.string().min(1),
  source: SourceSchema,
  grounding: z.enum(GROUNDINGS),
  note: z.string().nullable().default(null),
  change_reason: z.string().nullable().default(null),
  used_by: z.array(z.string()).default([])
});
export type EntryInput = z.infer<typeof EntryInputSchema>;

export function versionId(id: string, version: number): string {
  return `${id}@${version}`;
}

/** A place as a chain of geography ids, most local first. */
export interface Place {
  site?: string;
  city?: string;
  state?: string;
  national?: string;
}

export function geographyChain(p: Place): { level: Level; geography: string }[] {
  const out: { level: Level; geography: string }[] = [];
  if (p.site) out.push({ level: "site", geography: p.site });
  if (p.city) out.push({ level: "city", geography: p.city });
  if (p.state) out.push({ level: "state", geography: p.state });
  if (p.national) out.push({ level: "national", geography: p.national });
  out.push({ level: "global", geography: "global" });
  return out;
}

export const PANJIM: Place = { city: "IN-GA-panjim", state: "IN-GA", national: "IN" };

/** Geography id for a level in a place (the id an entry at that level must carry). */
export function geographyFor(level: Level, p: Place): string {
  if (level === "global") return "global";
  const g = level === "site" ? p.site : level === "city" ? p.city : level === "state" ? p.state : p.national;
  if (!g) throw new Error(`place has no ${level} id`);
  return g;
}
