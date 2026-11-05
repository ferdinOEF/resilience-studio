/**
 * Formatting for the run, model and library screens. Every number that comes out of the chain is shown with its
 * three bounds (low / central / high); large rupee values read as crore (1 crore = 1e7).
 */
import type { Bounds, CalibrationStatus, Hazard, Horizon, Pathway, RunStatus } from "./types";

export const HAZARD_LABEL: Record<Hazard, string> = { surge: "storm surge", flood: "river flood", compound: "compound", rain: "rain at high tide" };
export const HORIZON_LABEL: Record<Horizon, string> = { today: "today", "2050": "2050", "2100": "2100" };
export const PATHWAY_LABEL: Record<Pathway, string> = { ssp126: "SSP1-2.6", ssp245: "SSP2-4.5", ssp585: "SSP5-8.5" };
export const CALIBRATION_LABEL: Record<CalibrationStatus, string> = { uncalibrated: "uncalibrated", calibrated: "calibrated", signed_off: "signed off" };

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const crore = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const km2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const metres = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹ in crore with one decimal (1 crore = 1e7); below one crore in lakh, below one lakh in full. The full rupee figure goes in the title. */
export function fmtCrore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "₹0";
  if (Math.abs(n) >= 1e7) return `₹${crore.format(n / 1e7)} cr`;
  if (Math.abs(n) >= 1e5) return `₹${crore.format(n / 1e5)} lakh`;
  return `₹${inr.format(n)}`;
}
export function fmtInr(n: number): string {
  return Number.isFinite(n) ? `₹${inr.format(n)}` : "—";
}
export function fmtPeople(n: number): string {
  return Number.isFinite(n) ? count.format(Math.round(n)) : "—";
}
export const fmtCount = fmtPeople;
export function fmtKm2(n: number): string {
  return Number.isFinite(n) ? km2.format(n) : "—";
}
export function fmtMetres(n: number): string {
  return Number.isFinite(n) ? metres.format(n) : "—";
}
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms - m * 60_000) / 1000)} s`;
}
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
export function fmtRps(rps: number[]): string {
  return rps.map((r) => `1:${r}`).join(" · ");
}

export function RunStatusChip({ status }: { status: RunStatus }) {
  const cls = status === "ok" ? "chip-run-ok" : status === "failed" ? "chip-run-failed" : "chip-run-running";
  return <span className={`chip ${cls}`}>{status}</span>;
}
export function SignedOffChip({ signedOff, short }: { signedOff: boolean; short?: boolean }) {
  return <span className={`chip ${signedOff ? "chip-status-approved" : "chip-status-draft"}`}>{signedOff ? (short ? "signed off" : "chain signed off") : short ? "not signed off" : "chain not signed off"}</span>;
}
export function StaleChip({ stale }: { stale: boolean }) {
  return stale ? <span className="chip chip-stale">stale</span> : null;
}
export function CalibrationChip({ status }: { status: CalibrationStatus }) {
  const cls = status === "signed_off" ? "chip-status-approved" : status === "calibrated" ? "chip-level" : "chip-ground-placeholder";
  return <span className={`chip ${cls}`}>{CALIBRATION_LABEL[status]}</span>;
}

/** The three bounds of one quantity, central emphasised: "low · central · high". */
export function Bounds3({ v, fmt, title }: { v: Bounds; fmt: (n: number) => string; title?: (n: number) => string }) {
  return (
    <span className="b3" title={title ? `low ${title(v.low)} · central ${title(v.central)} · high ${title(v.high)}` : undefined}>
      <span className="b3-side">{fmt(v.low)}</span>
      <span className="b3-central">{fmt(v.central)}</span>
      <span className="b3-side">{fmt(v.high)}</span>
    </span>
  );
}

/** Colour class for who wrote a log line: Meta Mind dark, Liaison and validator teal, model agents grey, framework warn. */
export function whoClass(who: string): string {
  if (who === "meta-mind") return "who-meta";
  if (who === "liaison" || who === "validator") return "who-liaison";
  if (who === "framework") return "who-framework";
  return "who-agent";
}
export function whoLabel(who: string): string {
  if (who === "meta-mind") return "Meta Mind";
  if (who === "liaison") return "Liaison";
  if (who === "validator") return "Validator";
  if (who === "framework") return "Framework";
  return who;
}
