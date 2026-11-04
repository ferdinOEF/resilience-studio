/**
 * Resolution (spec section 3.2): local overrides national, in the order site, city, state, national, global.
 * The studio shows the level used beside every number, so the result carries it.
 */
import { geographyChain, type Level, type Place, type RegistryEntry, type Status } from "./schema";

export interface Resolved {
  entry: RegistryEntry;
  levelUsed: Level;
  /** how the studio names the level used, e.g. "city value" */
  levelLabel: string;
  /** levels that also had an entry but were overridden by a more local one */
  overrode: Level[];
}

export const LEVEL_LABEL: Record<Level, string> = {
  global: "global value",
  national: "national value",
  state: "state value",
  city: "city value",
  site: "site value"
};

/**
 * Pick, per entry id, the current version at each level: the latest approved version, or, on the admin side only
 * (`allowUnapproved`), the latest non-superseded version of any status. Then take the most local level present.
 */
export function resolveEntry(versions: RegistryEntry[], place: Place, opts: { allowUnapproved?: boolean } = {}): Resolved | null {
  const chain = geographyChain(place);
  const candidates: { level: Level; entry: RegistryEntry }[] = [];
  for (const { level, geography } of chain) {
    const atLevel = versions.filter((v) => v.level === level && v.geography === geography);
    const pick = currentVersion(atLevel, opts.allowUnapproved ? ["approved", "in_review", "draft"] : ["approved"]);
    if (pick) candidates.push({ level, entry: pick });
  }
  if (!candidates.length) return null;
  const [first, ...rest] = candidates;
  return { entry: first.entry, levelUsed: first.level, levelLabel: LEVEL_LABEL[first.level], overrode: rest.map((c) => c.level) };
}

/** The current version among one id's rows at one level: approved first, else the latest allowed status; never a superseded row. */
export function currentVersion(rows: RegistryEntry[], allowed: Status[]): RegistryEntry | null {
  const live = rows.filter((r) => r.status !== "superseded");
  const approved = live.filter((r) => r.status === "approved").sort((a, b) => b.version - a.version);
  if (approved.length) return approved[0];
  const others = live.filter((r) => allowed.includes(r.status)).sort((a, b) => b.version - a.version);
  return others[0] ?? null;
}

export function groupById(all: RegistryEntry[]): Map<string, RegistryEntry[]> {
  const byId = new Map<string, RegistryEntry[]>();
  for (const e of all) {
    const list = byId.get(e.id);
    if (list) list.push(e);
    else byId.set(e.id, [e]);
  }
  return byId;
}

/** Resolve every id in the registry for a place. */
export function resolveAll(all: RegistryEntry[], place: Place, opts: { allowUnapproved?: boolean } = {}): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  for (const [id, versions] of groupById(all)) {
    const r = resolveEntry(versions, place, opts);
    if (r) out.set(id, r);
  }
  return out;
}

/** Scalar value of a resolved entry, for the engine. */
export function scalarOf(r: Resolved): { value: number; low?: number; high?: number } {
  if (r.entry.value.type !== "scalar") throw new Error(`${r.entry.version_id} is a ${r.entry.value.type}, not a scalar`);
  return { value: r.entry.value.value, low: r.entry.value.low, high: r.entry.value.high };
}
