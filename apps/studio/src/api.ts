/**
 * The API the admin side consumes (apps/api, mounted at /api). Types mirror packages/registry/src/schema.ts;
 * the studio does not import the registry package, so the shapes are restated here.
 */

export const KINDS = ["parameter", "relationship", "formula", "index", "threshold", "curve", "dataset_ref"] as const;
export const LEVELS = ["global", "national", "state", "city", "site"] as const;
export const GROUNDINGS = ["solid_direct", "reasoned_extrapolation", "placeholder_needs_calibration"] as const;
export const SOURCE_TYPES = ["peer_reviewed", "un_giz_report", "government_doc", "official_dataset", "field_survey", "expert_elicitation"] as const;
export const STATUSES = ["draft", "in_review", "approved", "superseded"] as const;

export type Kind = (typeof KINDS)[number];
export type Level = (typeof LEVELS)[number];
export type Grounding = (typeof GROUNDINGS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type Status = (typeof STATUSES)[number];

export type EntryValue =
  | { type: "scalar"; value: number; low?: number; high?: number }
  | { type: "table"; columns: string[]; rows: (number | string | null)[][] }
  | { type: "expression"; expression: string }
  | { type: "reference"; uri: string; checksum?: string };

export interface Source {
  citation: string;
  source_type: SourceType;
  source_year: number | null;
  source_url: string | null;
  locator: string | null;
  citation_ids: string[];
}

export interface RegistryEntry {
  id: string;
  version: number;
  version_id: string;
  kind: Kind;
  label: string;
  value: EntryValue;
  unit: string;
  valid_range: [number | null, number | null] | null;
  level: Level;
  geography: string;
  source: Source;
  grounding: Grounding;
  note: string | null;
  author: string;
  reviewer: string | null;
  review_note: string | null;
  status: Status;
  created_at: string;
  approved_at: string | null;
  supersedes: string | null;
  change_reason: string | null;
  used_by: string[];
}

/** What POST /api/registry accepts (EntryInputSchema). */
export interface EntryInput {
  id: string;
  kind: Kind;
  label: string;
  value: EntryValue;
  unit: string;
  valid_range: [number | null, number | null] | null;
  level: Level;
  geography: string;
  source: Source;
  grounding: Grounding;
  note: string | null;
  change_reason: string | null;
  used_by: string[];
}

export interface RegistrySummary {
  id: string;
  label: string;
  kind: Kind;
  unit: string;
  level: Level;
  geography: string;
  grounding: Grounding;
  status: Status;
  version: number;
  version_id: string;
  versions: number;
  pending: number;
  value: EntryValue;
  source_type: SourceType;
  citation_ids: string[];
  used_by: string[];
}

export interface RegistryCounts {
  total: number;
  approved: number;
  in_review: number;
  draft: number;
  placeholders: number;
}

export interface RegistryList {
  entries: RegistrySummary[];
  counts: RegistryCounts;
  writes: { ok: boolean; reason?: string };
}

export interface DiffChange {
  field: string;
  from: unknown;
  to: unknown;
}

export type Role = "admin" | "scientist" | "reviewer" | "viewer";
export interface User {
  email: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly status: number,
    /** the parsed JSON body, when the API sent one (a gate error's unapproved list, a failed run's record) */
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch with JSON in and out; throws ApiError({error, code}) on a non-2xx answer. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers: { accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(typeof data?.error === "string" ? data.error : `${res.status} ${res.statusText || "request failed"}`, data?.code, res.status, data ?? undefined);
  if (data === null) throw new ApiError("The API returned no JSON", undefined, res.status);
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message === "Failed to fetch" ? "The API is unreachable" : e.message;
  return String(e);
}

export const canPropose = (u: User | null | undefined) => u?.role === "scientist" || u?.role === "admin";
export const canReview = (u: User | null | undefined) => u?.role === "reviewer" || u?.role === "admin";

/** Geography id the form proposes for a level (the Panjim pilot). */
export const GEOGRAPHY_DEFAULT: Record<Level, string> = { city: "IN-GA-panjim", state: "IN-GA", national: "IN", global: "global", site: "" };
