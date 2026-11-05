/**
 * Solutions (artboard 3): the catalogue in the rail (values only from approved registry entries, or in admin preview),
 * placement on the map (click a solution, choose a frontage segment, click the map), change vs do nothing from the
 * A/B runs when they exist, side effects the chain flagged, policy fit from the clause map.
 */
import { useMemo, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { fmtNum } from "../admin/format";
import { fmtCrore, fmtKm2, fmtPeople } from "../admin/numbers";
import type { Bounds } from "../admin/types";
import { navigate } from "../router";
import { isUnsigned, useFetch, useStudio } from "./data";
import { basemap, StudioMap, useMarkers, type MarkerDef } from "./Map";
import { useCityBase, useCityGeometry, useCrz, useCrzLayer } from "./cityLayers";
import { Layout } from "./Shell";
import { DASH, fmtSetting, Legend, NotModelledNotice, SectionLabel, Swatch, UnsignedChip } from "./ui";
import { DO_NOTHING, STUDIO_HAZARD_LABEL, type ClauseMap, type InstanceParam, type Placement, type Solution, type SolutionCategory, type SolutionsResponse } from "./types";

const CATEGORY_LABEL: Record<SolutionCategory, string> = { nbs: "Nature-based", engineered: "Engineered", hybrid: "Hybrid" };
const FLAG_TEXT: Record<string, string> = {
  scour: "toe scour / beach loss risk: a reflective wall on a sandy beach (not modelled, flagged)",
  squeeze: "coastal squeeze: a barrier behind mangroves blocks their landward migration as the sea rises",
  overtopped: "overtopped in this event: the water level exceeded the crest, no protection",
  removed: "removed by erosion in this event (FEMA 540 test), no protection",
  breached: "storage breached: the inflow exceeded the capacity, no storage this event",
  not_allowed: "not sited: the solution cannot work on this frontage and was ignored"
};

function paramValue(p: InstanceParam) {
  if (p.value === null) return <span className="chip chip-ground-placeholder">awaiting approval</span>;
  return (
    <span className="chip-row">
      <strong>
        {fmtNum(p.value)}
        {p.unit ? ` ${p.unit}` : ""}
      </strong>
      {p.level_label ? <span className="chip chip-level">{p.level_label}</span> : null}
      <span className={`chip ${p.grounding === "solid_direct" ? "chip-ground-solid" : p.grounding === "reasoned_extrapolation" ? "chip-ground-reasoned" : "chip-ground-placeholder"}`}>{GROUNDING_SHORT[String(p.grounding)] ?? String(p.grounding).replace(/_/g, " ")}</span>
      {p.status !== "approved" ? <UnsignedChip /> : null}
    </span>
  );
}

export function Solutions() {
  const { previewOn, scenario, solutionSet, setSolutionSet, pair, modelled, reason, run } = useStudio();
  const [map, setMap] = useState<MLMap | null>(null);
  const [filter, setFilter] = useState<"all" | SolutionCategory>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [segment, setSegment] = useState<string | null>(null);

  const cat = useFetch<SolutionsResponse>(`/api/solutions${previewOn ? "?admin=1" : ""}`);
  const clause = useFetch<{ data: ClauseMap }>("/api/places/panjim/layers/policy_clause_map");
  const g = useCityGeometry();
  useCityBase(map, g);
  const crz = useCrz(true);
  useCrzLayer(map, crz.data?.data ?? null, true, { fillClass: "M", lines: false });

  const solutions = cat.data?.solutions ?? [];
  const segments = cat.data?.segments ?? [];
  const sol = solutions.find((s) => s.id === selected) ?? null;
  const allowed = sol?.allowed_segments ?? [];
  const activeSegment = segment && allowed.includes(segment) ? segment : (allowed[0] ?? null);
  const segName = (id: string | null) => segments.find((s) => s.id === id)?.name ?? id ?? "all segments";

  const markers = useMemo<MarkerDef[]>(
    () =>
      solutionSet.placements.map((p) => ({
        id: p.id,
        lngLat: [p.lon, p.lat],
        className: "placement-dot",
        title: `${solutions.find((s) => s.id === p.solutionId)?.name ?? p.solutionId} · ${segName(p.segmentId)}`
      })),
    [solutionSet, solutions]
  );
  useMarkers(map, markers);

  const place = (lngLat: { lng: number; lat: number }) => {
    if (!sol || !activeSegment) return;
    const params: Record<string, number> = {};
    for (const ip of sol.instance_params) if (ip.value !== null) params[ip.key] = ip.value;
    const p: Placement = { id: `pl-${Date.now().toString(36)}`, solutionId: sol.id, segmentId: activeSegment, params, lon: lngLat.lng, lat: lngLat.lat };
    const placements = [...solutionSet.placements, p];
    const ids = Array.from(new Set(placements.map((x) => x.solutionId)));
    setSolutionSet({ id: `set-${ids.join("+")}`, label: ids.map((id) => solutions.find((s) => s.id === id)?.name.split(" (")[0].split(" / ")[0] ?? id).join(" + "), placements });
  };
  const remove = (id: string) => {
    const placements = solutionSet.placements.filter((p) => p.id !== id);
    if (!placements.length) return setSolutionSet(DO_NOTHING);
    const ids = Array.from(new Set(placements.map((x) => x.solutionId)));
    setSolutionSet({ id: `set-${ids.join("+")}`, label: ids.map((sid) => solutions.find((s) => s.id === sid)?.name.split(" (")[0].split(" / ")[0] ?? sid).join(" + "), placements });
  };

  const shown = solutions.filter((s) => filter === "all" || s.category === filter);
  const bm = basemap();

  const rail = (
    <>
      <SectionLabel>Solutions catalogue</SectionLabel>
      <div className="muted small">
        for {segName(activeSegment)} · {STUDIO_HAZARD_LABEL[scenario.hazard]}
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        {(["all", "nbs", "engineered", "hybrid"] as const).map((f) => (
          <button key={f} type="button" className={`chip-filter${filter === f ? " is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>
      {cat.error ? <div className="muted small">Catalogue not loaded: {cat.error}</div> : null}
      <div className="sol-list">
        {shown.map((s) => (
          <SolutionCard key={s.id} s={s} selected={s.id === selected} onSelect={() => setSelected(s.id === selected ? null : s.id)} segments={segments} activeSegment={s.id === selected ? activeSegment : null} onSegment={setSegment} />
        ))}
      </div>
    </>
  );

  const a = pair.a?.result?.totals ?? null, b = pair.b?.result?.totals ?? null;
  const changeRows: { label: string; a: Bounds | null; b: Bounds | null; fmt: (n: number) => string }[] = [
    { label: "Area flooded", a: a?.flooded_km2 ?? null, b: b?.flooded_km2 ?? null, fmt: fmtKm2 },
    { label: "People affected", a: a?.people_affected ?? null, b: b?.people_affected ?? null, fmt: fmtPeople },
    { label: "Direct loss", a: a?.damage_inr ?? null, b: b?.damage_inr ?? null, fmt: fmtCrore }
  ];
  const flags = (pair.b?.result?.per_segment ?? []).flatMap((s) => s.flags.map((f) => ({ seg: s.id, flag: f })));
  const instruments = clause.data?.data.instruments ?? [];

  const card = (
    <>
      <div className="card-head">
        <SectionLabel>Selected set · {solutionSet.placements.length}</SectionLabel>
        <h1 className="card-title">{solutionSet.label}</h1>
      </div>
      {solutionSet.placements.length ? (
        <ul className="placed-list">
          {solutionSet.placements.map((p) => (
            <li key={p.id}>
              <span>
                {solutions.find((s) => s.id === p.solutionId)?.name.split(" (")[0] ?? p.solutionId}
                <span className="muted small"> · {segName(p.segmentId)}</span>
              </span>
              <button type="button" className="link-btn small" onClick={() => remove(p.id)} aria-label="Remove placement">
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="muted small">Nothing placed: B compares as do nothing.</div>
      )}
      <SectionLabel>Change vs do nothing</SectionLabel>
      {a && b ? (
        <div className="change-bars">
          {changeRows.map((r) => {
            const d = r.a && r.b ? r.b.central - r.a.central : null;
            const pct = r.a && r.b && r.a.central ? (d! / r.a.central) * 100 : null;
            return (
              <div key={r.label} className="change-row">
                <div className="change-head">
                  <span>{r.label}</span>
                  <span className={`num ${d !== null && d < 0 ? "delta-good" : d !== null && d > 0 ? "delta-bad" : ""}`}>
                    {d === null ? DASH : `${d < 0 ? "−" : d > 0 ? "+" : ""}${r.fmt(Math.abs(d))}${pct !== null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)` : ""}`}
                  </span>
                </div>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${Math.min(100, Math.abs(pct ?? 0))}%`, background: d !== null && d < 0 ? "var(--green)" : "var(--risk-4)" }} />
                </div>
              </div>
            );
          })}
          {isUnsigned(pair.a) || isUnsigned(pair.b) ? <UnsignedChip /> : null}
        </div>
      ) : (
        <div className="muted">{DASH} · run the comparison in Scenarios</div>
      )}
      <SectionLabel>Side effects the chain found</SectionLabel>
      {pair.b ? (
        flags.length ? (
          <ul className="note-list">
            {flags.map((f, i) => (
              <li key={i} className="hint-warn">
                {segName(f.seg)}: {FLAG_TEXT[f.flag] ?? f.flag}
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted">None flagged in run B.</div>
        )
      ) : (
        <div className="muted">{DASH}</div>
      )}
      <SectionLabel>Policy fit</SectionLabel>
      <ul className="fit-list">
        {instruments.map((i) => (
          <li key={i.id}>
            <span>{i.short}</span>
            <span className="chip chip-unassessed">Unassessed · awaiting expert sign-off</span>
          </li>
        ))}
        {!instruments.length ? <li className="muted small">Clause map not loaded</li> : null}
      </ul>
      {!modelled && !run ? <NotModelledNotice reason={reason} compact /> : null}
      <button type="button" className="btn btn-primary btn-lg st-cta" onClick={() => navigate("/scenarios")}>
        Compare in Scenarios
      </button>
    </>
  );

  return (
    <Layout view="solutions" scale={null} rail={rail} railWidth={320} card={card} cardWidth={340}>
      <StudioMap bounds={g.bounds} padding={20} onLoad={setMap} onUnload={() => setMap(null)} onClick={place}>
        <div className="map-note map-note-top">{sol ? `Placing ${sol.name.split(" (")[0]} on ${segName(activeSegment)}: click the map` : "Place a solution: click a solution, then click the map"}</div>
        <Legend title="Feasibility shading">
          <Swatch color="#e9a96b" opacity={0.35} label="CRZ-I (mangrove): hard structures not permitted (CRZ 2019 — to confirm clause by clause)" />
          <Swatch kind="dot" color="var(--teal)" label="Solution placed" />
          <Swatch kind="line" color="var(--teal)" label="Panaji footprint (Census 2001)" />
          <Swatch kind="line" color="var(--green)" label="Field bunds (traced)" />
          <div className="legend-note">Frontage segments are listed in the rail; their geometry is not drawn until supplied.</div>
          <div className="legend-credit">
            CRZ classes: Goa CZMP (reasoned extrapolation) · Basemap: {bm.name} · {bm.credit}
          </div>
        </Legend>
      </StudioMap>
    </Layout>
  );
}

const GROUNDING_SHORT: Record<string, string> = { solid_direct: "solid · direct", reasoned_extrapolation: "reasoned", placeholder_needs_calibration: "placeholder" };

function SolutionCard({ s, selected, onSelect, segments, activeSegment, onSegment }: { s: Solution; selected: boolean; onSelect: () => void; segments: SolutionsResponse["segments"]; activeSegment: string | null; onSegment: (id: string) => void }) {
  const ref = s.ipcc_ar6_reference;
  return (
    <div className={`sol-card${selected ? " is-selected" : ""}`}>
      <button type="button" className="sol-card-btn" onClick={onSelect} aria-pressed={selected}>
        <div className="sol-card-head">
          <span className="sol-name">{s.name}</span>
          <span className={`chip chip-cat-${s.category}`}>{CATEGORY_LABEL[s.category]}</span>
        </div>
        <div className="muted small">{s.summary}</div>
        <div className="sol-meta small">
          {ref ? (
            <span title={ref.mappingNote}>
              IPCC AR6 · {ref.row}: Effect {ref.effectiveness} · Feasibility {ref.general}
            </span>
          ) : (
            <span className="muted">IPCC AR6 feasibility row: none mapped</span>
          )}
          <span className="muted" title="not in the registry">
            Cost — / Time —
          </span>
        </div>
      </button>
      {selected ? (
        <div className="sol-detail">
          <div className="small">
            <span className="muted">Allowed on: </span>
            {segments.map((g) => {
              const ok = s.allowed_segments.includes(g.id);
              return (
                <button key={g.id} type="button" className={`seg-chip${ok ? "" : " is-off"}${activeSegment === g.id ? " is-active" : ""}`} disabled={!ok} title={`${g.name} · ${fmtSetting(g.setting)}${g.khazanPresent ? " · khazan present" : ""}`} onClick={() => onSegment(g.id)}>
                  {g.name}
                </button>
              );
            })}
          </div>
          {s.instance_params.length ? (
            <dl className="param-list">
              {s.instance_params.map((p) => (
                <div key={p.key} className="param-row">
                  <dt title={p.registry_id}>{p.label}</dt>
                  <dd>{paramValue(p)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="muted small">No instance parameters.</div>
          )}
          <details className="small sol-evidence">
            <summary className="muted">Evidence</summary>
            <div className="muted">{s.evidence}</div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
