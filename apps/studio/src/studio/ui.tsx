/** Small shared pieces of the studio views: segmented controls, layer rows, stat tiles, chips, legends, the not-modelled notice. */
import type { ReactNode } from "react";
import type { Bounds, RunSummary } from "../admin/types";
import { RISK_CLASS_LABEL } from "./types";

export const DASH = "—";

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="adm-section-label st-label">{children}</div>;
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: SegOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`seg-btn${o.value === value ? " is-active" : ""}`} disabled={o.disabled} title={o.title} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CheckRow({ label, tag, checked, onChange, disabled, hint }: { label: string; tag?: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`layer-row${disabled ? " is-disabled" : ""}`} title={hint}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="layer-row-text">
        <span className="layer-row-label">{label}</span>
        {disabled && hint ? <span className="layer-row-hint">{hint}</span> : null}
      </span>
      {tag ? <span className={`src-tag src-${tag}`}>{tag}</span> : null}
    </label>
  );
}

export function RadioRow({ name, label, value, current, onChange, hint, disabled }: { name: string; label: string; value: string; current: string; onChange: (v: string) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={`layer-row${disabled ? " is-disabled" : ""}`} title={hint}>
      <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
      <span className="layer-row-text">
        <span className="layer-row-label">{label}</span>
        {hint && disabled ? <span className="layer-row-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function StatTile({ label, value, sub, unsigned }: { label: string; value: ReactNode; sub?: ReactNode; unsigned?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-num">{value}</div>
      {sub || unsigned ? (
        <div className="stat-sub">
          {sub}
          {unsigned ? <UnsignedChip /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function UnsignedChip() {
  return (
    <span className="chip chip-unsigned" title="From a run whose chain is not signed off, or that is stale: admin preview only">
      unsigned
    </span>
  );
}

export function RiskChip({ cls, rank }: { cls: 1 | 2 | 3 | 4; rank?: boolean }) {
  return (
    <span className={`chip chip-risk-${cls}`} title={rank ? "rank class among zones, not a sourced rating" : undefined}>
      {RISK_CLASS_LABEL[cls]}
    </span>
  );
}

export function Legend({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="legend">
      <div className="legend-title">{title}</div>
      {children}
    </div>
  );
}

export function Swatch({ color, label, kind = "fill", opacity }: { color: string; label: ReactNode; kind?: "fill" | "line" | "dash" | "dot"; opacity?: number }) {
  const style =
    kind === "fill"
      ? { background: color, opacity: opacity ?? 1 }
      : kind === "line"
        ? { border: `2px solid ${color}`, background: "transparent" }
        : kind === "dash"
          ? { border: `2px dashed ${color}`, background: "transparent" }
          : { background: color, borderRadius: 999, width: 10, height: 10 };
  return (
    <div className="legend-row">
      <span className={`swatch swatch-${kind}`} style={style} />
      <span>{label}</span>
    </div>
  );
}

export function GreyNote({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`grey-note${className ? " " + className : ""}`}>
      {title ? <div className="grey-note-title">{title}</div> : null}
      {children}
    </div>
  );
}

/** The one calm notice a view shows when the place is not modelled; numbers elsewhere just read "—". */
export function NotModelledNotice({ reason, compact }: { reason: string; compact?: boolean }) {
  return (
    <div className={`nm-notice${compact ? " is-compact" : ""}`}>
      <div className="nm-title">Not yet modelled</div>
      <div className="nm-body">
        Panjim is not yet modelled to the studio standard: {reason}. Results appear once the chain is calibrated against a supplied event and signed off.
      </div>
    </div>
  );
}

/** A quantity with its three bounds: central large, low–high beside it; "—" when there is none. */
export function BoundValue({ v, fmt, unsigned }: { v: Bounds | null | undefined; fmt: (n: number) => string; unsigned?: boolean }) {
  if (!v) return <span className="num-dash">{DASH}</span>;
  return (
    <span className="bv" title={`low ${fmt(v.low)} · central ${fmt(v.central)} · high ${fmt(v.high)}`}>
      <span className="bv-central">{fmt(v.central)}</span>
      <span className="bv-range">
        {fmt(Math.min(v.low, v.high))}–{fmt(Math.max(v.low, v.high))}
      </span>
      {unsigned ? <UnsignedChip /> : null}
    </span>
  );
}

/** Evidence under the numbers: which registry levels the run used and whether every entry was approved. */
export function EvidenceLine({ run }: { run: RunSummary | null }) {
  if (!run) return null;
  const by: Record<string, number> = {};
  let unapproved = 0;
  for (const v of run.registry_versions) {
    by[v.level_used] = (by[v.level_used] ?? 0) + 1;
    if (v.status !== "approved") unapproved++;
  }
  const levels = ["site", "city", "state", "national", "global"].filter((l) => by[l]).map((l) => `${by[l]} ${l}`);
  return (
    <div className="evidence-line">
      Registry: {run.registry_versions.length} entries · level used: {levels.join(" · ") || "—"} · {unapproved ? <span className="hint-warn">{unapproved} not approved</span> : "all approved"}
      {" · "}
      <span className="mono">{run.id}</span>
    </div>
  );
}

export function fmtSetting(s: string): string {
  return s.replace(/_/g, " ");
}
