/** Labels, chips and compact value formatting. Every number is shown with its level and grounding beside it (spec 3.2). */
import type { EntryValue, Grounding, Level, SourceType, Status } from "../api";

export const LEVEL_LABEL: Record<Level, string> = { site: "site value", city: "city value", state: "state value", national: "national value", global: "global value" };
export const GROUNDING_LABEL: Record<Grounding, string> = { solid_direct: "solid · direct", reasoned_extrapolation: "reasoned extrapolation", placeholder_needs_calibration: "placeholder · needs calibration" };
export const STATUS_LABEL: Record<Status, string> = { draft: "draft", in_review: "in review", approved: "approved", superseded: "superseded" };
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  peer_reviewed: "peer-reviewed",
  un_giz_report: "UN / GIZ report",
  government_doc: "government document",
  official_dataset: "official dataset",
  field_survey: "field survey",
  expert_elicitation: "expert elicitation"
};

const GROUNDING_CLASS: Record<Grounding, string> = { solid_direct: "chip-ground-solid", reasoned_extrapolation: "chip-ground-reasoned", placeholder_needs_calibration: "chip-ground-placeholder" };

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-IN", { maximumSignificantDigits: 4 });
}

export function fmtValue(v: EntryValue, unit: string): string {
  switch (v.type) {
    case "scalar": {
      const range = v.low !== undefined || v.high !== undefined ? ` [${v.low !== undefined ? fmtNum(v.low) : "…"}–${v.high !== undefined ? fmtNum(v.high) : "…"}]` : "";
      return `${fmtNum(v.value)}${range}${unit ? " " + unit : ""}`;
    }
    case "table":
      return `table · ${v.rows.length} rows`;
    case "reference":
      return "dataset";
    case "expression":
      return v.expression;
  }
}

export function fmtRange(r: [number | null, number | null] | null): string {
  if (!r) return "—";
  return `${r[0] === null ? "−∞" : fmtNum(r[0])} to ${r[1] === null ? "∞" : fmtNum(r[1])}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function GroundingChip({ grounding }: { grounding: Grounding }) {
  return <span className={`chip ${GROUNDING_CLASS[grounding] ?? ""}`}>{GROUNDING_LABEL[grounding] ?? grounding}</span>;
}

export function LevelChip({ level, geography }: { level: Level; geography?: string }) {
  return (
    <span className="chip chip-level" title={geography ? `${level} · ${geography}` : level}>
      {LEVEL_LABEL[level] ?? level}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip chip-status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function PendingBadge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="chip chip-pending">{n} pending</span>;
}

/** Where a value is shown, its level and grounding sit beside it. */
export function Evidence({ level, geography, grounding }: { level: Level; geography?: string; grounding: Grounding }) {
  return (
    <span className="evidence">
      <LevelChip level={level} geography={geography} />
      <GroundingChip grounding={grounding} />
    </span>
  );
}

/** Compact rendering of any field value for the diff table. */
export function fmtAny(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.length ? v.join(", ") : "—";
  return JSON.stringify(v, null, 1).replace(/\n\s*/g, " ");
}
