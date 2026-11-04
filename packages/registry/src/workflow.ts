/**
 * Versioning and review (spec section 3.2): versioned, never overwritten; two-person rule; no source, no save.
 * Pure functions over entry rows; the store persists what they return.
 */
import { EntryInputSchema, versionId, type EntryInput, type RegistryEntry } from "./schema";

export type RegistryErrorCode = "no_source" | "two_person" | "bad_state" | "not_found" | "invalid" | "forbidden";

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly code: RegistryErrorCode
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

/** Build a new version row from a submission. Throws RegistryError("no_source") without a citation and a source type. */
export function draftVersion(input: unknown, author: string, existing: RegistryEntry[], now = new Date().toISOString()): RegistryEntry {
  const parsed = EntryInputSchema.safeParse(input);
  if (!parsed.success) {
    const noSource = parsed.error.issues.some((i) => i.path[0] === "source");
    const msg = noSource
      ? "No source, no save: a full citation and a source type are required"
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new RegistryError(msg, noSource ? "no_source" : "invalid");
  }
  const d: EntryInput = parsed.data;
  const prior = existing.filter((e) => e.id === d.id).sort((a, b) => b.version - a.version);
  const version = (prior[0]?.version ?? 0) + 1;
  const current = prior.find((e) => e.status === "approved") ?? prior[0] ?? null;
  if (prior.length && !d.change_reason) throw new RegistryError("A new version needs a change reason", "invalid");
  return {
    ...d,
    version,
    version_id: versionId(d.id, version),
    author,
    reviewer: null,
    review_note: null,
    status: "draft",
    created_at: now,
    approved_at: null,
    supersedes: current ? current.version_id : null,
    used_by: d.used_by.length ? d.used_by : (current?.used_by ?? [])
  };
}

export function submitForReview(row: RegistryEntry): RegistryEntry {
  if (row.status !== "draft") throw new RegistryError(`Only a draft can be submitted (this one is ${row.status})`, "bad_state");
  return { ...row, status: "in_review" };
}

/**
 * Approve: author must differ from reviewer; the previous approved version (if any) becomes superseded.
 * Returns the approved row and the rows to mark superseded.
 */
export function approve(
  row: RegistryEntry,
  reviewer: string,
  siblings: RegistryEntry[],
  note: string | null = null,
  now = new Date().toISOString()
): { approved: RegistryEntry; superseded: RegistryEntry[] } {
  if (row.status !== "in_review" && row.status !== "draft") throw new RegistryError(`Cannot approve a ${row.status} entry`, "bad_state");
  if (!reviewer || reviewer === row.author) throw new RegistryError("Two-person rule: the reviewer must differ from the author", "two_person");
  const superseded = siblings
    .filter((s) => s.id === row.id && s.version !== row.version && s.status === "approved")
    .map((s) => ({ ...s, status: "superseded" as const }));
  return { approved: { ...row, status: "approved", reviewer, review_note: note, approved_at: now }, superseded };
}

/** Reject: back to draft with the reviewer's note. The row is kept; nothing is deleted. */
export function reject(row: RegistryEntry, reviewer: string, note: string): RegistryEntry {
  if (row.status !== "in_review") throw new RegistryError(`Only an entry in review can be rejected (this one is ${row.status})`, "bad_state");
  if (!reviewer || reviewer === row.author) throw new RegistryError("Two-person rule: the reviewer must differ from the author", "two_person");
  if (!note) throw new RegistryError("A rejection needs a note", "invalid");
  return { ...row, status: "draft", reviewer, review_note: note };
}

/** Field-level diff between two versions, for the admin's version history. */
export function diffVersions(a: RegistryEntry, b: RegistryEntry): { field: string; from: unknown; to: unknown }[] {
  const fields: (keyof RegistryEntry)[] = ["kind", "label", "value", "unit", "valid_range", "level", "geography", "source", "grounding", "note", "used_by"];
  const out: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of fields) {
    const x = JSON.stringify(a[f]);
    const y = JSON.stringify(b[f]);
    if (x !== y) out.push({ field: f, from: a[f], to: b[f] });
  }
  return out;
}
