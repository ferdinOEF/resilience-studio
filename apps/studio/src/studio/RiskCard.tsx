/**
 * Component · Risk-rating card (328 px): WARD / name / setting; a 64 px rating tile with the class 1–4; three factor
 * bars with a one-line "why" built from the zone aggregates; key figures; calibration chip and the evidence link.
 * Every class here is a rank among the placeholder zones, named as such; nothing is a sourced grade.
 */
import { fmtMetres, fmtPeople } from "../admin/numbers";
import type { ModelSummary, RunSummary } from "../admin/types";
import { Link } from "../router";
import { RISK_HEX } from "./cityLayers";
import { runEventLabel, useFetch } from "./data";
import { NotModelledNotice, SectionLabel, UnsignedChip } from "./ui";
import { RISK_CLASS_LABEL, STUDIO_HAZARD_LABEL, type ZoneStats } from "./types";

export type ShowAs = "combined" | "H" | "E" | "V";

export interface RiskCardProps {
  zone: ZoneStats | null;
  zones: ZoneStats[];
  run: RunSummary | null;
  modelled: boolean;
  reason: string;
  unsigned: boolean;
  /** which rank the tile shows: the combined rank_class or the single-factor rank */
  cls: 1 | 2 | 3 | 4 | null;
  showAs: ShowAs;
}

function share(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function RiskCard({ zone, zones, run, modelled, reason, unsigned, cls, showAs }: RiskCardProps) {
  const signed = !!run && run.chain_signed_off && !run.stale;
  const models = useFetch<{ models: ModelSummary[] }>(signed ? "/api/models" : null);
  const event = models.data?.models.find((m) => m.id === "water-level")?.calibration.events.slice(-1)[0]?.event ?? null;
  const name = zone?.name ?? "Ward";
  const header = (
    <div className="rc-head">
      <SectionLabel>Ward</SectionLabel>
      <div className="rc-name">{name}</div>
      <div className="muted small">{zone ? "Landmark-derived placeholder zone · Census 2001 Panaji footprint · awaiting the CCP ward shapefile" : "No ward selected · ward boundaries awaiting the CCP shapefile"}</div>
    </div>
  );

  if (!modelled || !run || !zone) {
    return (
      <div className="rc">
        {header}
        {!modelled ? <NotModelledNotice reason={reason} compact /> : zones.length ? <div className="muted">Select a zone on the map or in the City view.</div> : <div className="muted">Ward boundaries: awaiting the CCP shapefile (spec §7, item 5). City-level results are in the City view; ward ratings follow once wards exist.</div>}
      </div>
    );
  }

  const maxDepth = Math.max(...zones.map((z) => z.depth_mean_m ?? 0), 0.01);
  const maxExposure = Math.max(...zones.map((z) => z.people_total + z.buildings_total), 1);
  const maxSvi = Math.max(...zones.map((z) => z.svi_higher_share), 0.01);
  const factors = [
    { key: "H", label: "Hazard", width: (zone.depth_mean_m ?? 0) / maxDepth, why: zone.depth_mean_m !== null ? `Mean depth ${fmtMetres(zone.depth_mean_m)} m · max ${fmtMetres(zone.depth_max_m ?? 0)} m in the zone` : "No flooded cell in the zone for this event" },
    { key: "E", label: "Exposure", width: (zone.people_total + zone.buildings_total) / maxExposure, why: `${fmtPeople(zone.people_total)} people · ${fmtPeople(zone.buildings_total)} buildings in the zone` },
    { key: "V", label: "Vulnerability", width: zone.svi_higher_share / maxSvi, why: `SVI higher class: ${share(zone.svi_higher_share)} of the zone's cells` }
  ];
  const tileCls = cls ?? zone.rank_class;

  return (
    <div className="rc">
      {header}
      <div className="rc-rating">
        <div className="rc-tile" style={{ background: RISK_HEX[tileCls], color: tileCls === 4 ? "#fff" : "var(--ink)" }} title="rank class among zones, not a sourced rating">
          {tileCls}
        </div>
        <div className="rc-rating-text">
          <div className="rc-rating-title">
            {RISK_CLASS_LABEL[tileCls]} risk {showAs === "combined" ? "" : `· ${showAs === "H" ? "hazard" : showAs === "E" ? "exposure" : "vulnerability"} only`}
          </div>
          <div className="muted small">
            {STUDIO_HAZARD_LABEL[run.plan.scenario.hazard]} · {runEventLabel(run)}
          </div>
          <div className="muted small">
            Rank {zone.rank} of {zones.length} zones · rank among zones {unsigned ? <UnsignedChip /> : null}
          </div>
        </div>
      </div>
      <div className="rc-factors">
        {factors.map((f) => (
          <div key={f.key} className="rc-factor">
            <div className="rc-factor-head">
              <span>{f.label}</span>
              <span className="muted small">rank among zones</span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.max(3, Math.round(f.width * 100))}%`, background: f.key === "H" ? "var(--flood-deep)" : f.key === "E" ? "var(--teal)" : "var(--risk-3)" }} />
            </div>
            <div className="muted small">{f.why}</div>
          </div>
        ))}
      </div>
      <SectionLabel>Key figures</SectionLabel>
      <dl className="rc-figures">
        <dt>Flood depth range</dt>
        <dd>{zone.depth_max_m !== null ? `0–${fmtMetres(zone.depth_max_m)} m` : "—"}</dd>
        <dt>People affected</dt>
        <dd>
          {fmtPeople(zone.people_in_flood)} <span className="muted small">({share(zone.people_share)} of the zone)</span>
        </dd>
        <dt>Buildings in flood</dt>
        <dd>{fmtPeople(zone.buildings_in_flood)}</dd>
        <dt>Nearest relief centre</dt>
        <dd className="muted">no DDMP positions</dd>
      </dl>
      <div className="rc-foot">
        <div className="chip-row">
          {signed ? <span className="chip chip-status-approved">Calibrated{event ? ` · ${event}` : ""}</span> : <span className="chip chip-ground-placeholder">Not calibrated</span>}
          {unsigned ? <UnsignedChip /> : null}
        </div>
        <div className="muted small">Water level: ported chain · Damage: Huizinga 2017 · People: GHS-POP 2020 rescaled to Census 2011</div>
        <Link href={`/admin/runs/${encodeURIComponent(run.id)}`} className="small">
          View evidence chain →
        </Link>
      </div>
    </div>
  );
}
