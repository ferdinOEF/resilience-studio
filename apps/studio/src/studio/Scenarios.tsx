/**
 * Scenarios (artboard 2): build a scenario in the rail, A | B split maps with a swipe handle, the A vs B table on the
 * right. A = do nothing, B = the solution set chosen in Solutions. Runs are requested on the admin side in Phase 1; a
 * signed-in scientist or admin can request the pair from here and sees it in admin preview.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { api, canPropose, errorMessage } from "../api";
import { fmtCrore, fmtKm2, fmtPeople, PATHWAY_LABEL } from "../admin/numbers";
import type { Bounds, Hazard, ModelSummary, Outlay, Pathway, RunSummary } from "../admin/types";
import { HAZARDS, RETURN_PERIODS } from "../admin/types";
import { Link } from "../router";
import { isUnsigned, runEventLabel, useExtent, useFetch, useRunDetail, useStudio } from "./data";
import { basemap, StudioMap, useMarkers, type MarkerDef } from "./Map";
import { useCityBase, useCityGeometry, useExtentLayer } from "./cityLayers";
import { Layout } from "./Shell";
import { DASH, EvidenceLine, GreyNote, NotModelledNotice, SectionLabel, Segmented, Swatch, UnsignedChip } from "./ui";
import { DO_NOTHING, horizonOf, STUDIO_HAZARD_LABEL, type ScenarioChoice } from "./types";

const PATHWAY_HINT: Record<Pathway, string> = { ssp126: "low", ssp245: "middle", ssp585: "high" };

/** Return periods for a requested run: up to the chosen one so the annual expectation integrates, the chosen one last (= the headline). */
function rpsFor(rp: 10 | 50 | 100) {
  return RETURN_PERIODS.filter((r) => r <= rp && (r === rp || r !== 50));
}

export function Scenarios() {
  const { user, scenario, setScenario, solutionSet, runs, allRuns, previewOn, setPreview, modelled, reason, pair, setPair, refreshRuns } = useStudio();
  const [mapA, setMapA] = useState<MLMap | null>(null);
  const [mapB, setMapB] = useState<MLMap | null>(null);
  const [split, setSplit] = useState(0.5);
  const wrap = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const g = useCityGeometry();
  useCityBase(mapA, g, { prefix: "a-" });
  useCityBase(mapB, g, { prefix: "b-" });

  // which runs A and B are
  const pairMatches = pair.a && pair.a.plan.scenario.hazard === scenario.hazard;
  const runA = pairMatches ? pair.a : (runs[scenario.hazard] ?? null);
  const runB = useMemo<RunSummary | null>(() => {
    if (pairMatches && pair.b) return pair.b;
    if (!previewOn || solutionSet.id === "do-nothing") return null;
    return allRuns.find((r) => r.status === "ok" && r.plan.scenario.hazard === scenario.hazard && r.plan.scenario.solution_set.id === solutionSet.id) ?? null;
  }, [pairMatches, pair.b, previewOn, solutionSet.id, allRuns, scenario.hazard]);

  const extA = useExtent(runA, previewOn);
  const extB = useExtent(runB, previewOn);
  useExtentLayer(mapA, extA.data?.data ?? null, true, "a-");
  useExtentLayer(mapB, extB.data?.data ?? null, true, "b-");
  const placementMarkers = useMemo<MarkerDef[]>(() => solutionSet.placements.map((p) => ({ id: p.id, lngLat: [p.lon, p.lat], className: "placement-dot", title: `${p.solutionId} · ${p.segmentId}` })), [solutionSet]);
  useMarkers(mapB, placementMarkers);

  // keep the two maps in step
  useEffect(() => {
    if (!mapA || !mapB) return;
    let lock = false;
    const follow = (from: MLMap, to: MLMap) => () => {
      if (lock) return;
      lock = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: 0, pitch: 0 });
      lock = false;
    };
    const fa = follow(mapA, mapB), fb = follow(mapB, mapA);
    mapA.on("move", fa);
    mapB.on("move", fb);
    return () => {
      mapA.off("move", fa);
      mapB.off("move", fb);
    };
  }, [mapA, mapB]);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = wrap.current;
    if (!el) return;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setSplit(Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const detailB = useRunDetail(runB && !pair.outlayB ? runB.id : null);
  const outlayB: Outlay | null = pairMatches && pair.outlayB ? pair.outlayB : (detailB.data?.outlay ?? null);
  const models = useFetch<{ models: ModelSummary[] }>("/api/models");
  const signedCount = runA ? runA.contracts.filter((c) => c.calibration_status === "signed_off").length : (models.data?.models.filter((m) => m.calibration.status === "signed_off").length ?? null);
  const bm = basemap();
  const horizon = horizonOf(scenario.year);
  const upd = (patch: Partial<ScenarioChoice>) => setScenario({ ...scenario, ...patch });
  const mayRun = canPropose(user);

  const runPair = async () => {
    setBusy("Requesting run A (do nothing)…");
    setError(null);
    const base = { place: "panjim", hazard: scenario.hazard, return_periods: rpsFor(scenario.rp), horizon, pathway: scenario.pathway };
    const tag = `${STUDIO_HAZARD_LABEL[scenario.hazard]} 1-in-${scenario.rp} ${horizon} ${PATHWAY_LABEL[scenario.pathway]}`;
    try {
      const a = await api<{ run: RunSummary; outlay: Outlay }>("/api/runs", { method: "POST", json: { question: `Scenarios A · do nothing · ${tag}`, scenario: { ...base, solution_set: DO_NOTHING } } });
      setBusy(`Requesting run B (${solutionSet.label})…`);
      const placements = solutionSet.placements.map(({ id, solutionId, segmentId, params }) => ({ id, solutionId, segmentId, params }));
      const b = await api<{ run: RunSummary; outlay: Outlay }>("/api/runs", { method: "POST", json: { question: `Scenarios B · ${solutionSet.label} · ${tag}`, scenario: { ...base, solution_set: { id: solutionSet.id, label: solutionSet.label, placements } } } });
      setPair({ a: a.run, b: b.run, outlayB: b.outlay });
      setPreview(true);
      refreshRuns();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rail = (
    <>
      <SectionLabel>Build a scenario</SectionLabel>
      <label className="field-label" htmlFor="sc-hazard">
        Hazard
      </label>
      <select id="sc-hazard" className="select" value={scenario.hazard} onChange={(e) => upd({ hazard: e.target.value as Hazard })}>
        {HAZARDS.map((h) => (
          <option key={h} value={h}>
            {STUDIO_HAZARD_LABEL[h]}
          </option>
        ))}
        <option disabled>Landslide · not in this phase</option>
      </select>
      <div className="field-label">Return period</div>
      <Segmented<"10" | "50" | "100"> ariaLabel="Return period" value={String(scenario.rp) as "10" | "50" | "100"} onChange={(v) => upd({ rp: Number(v) as 10 | 50 | 100 })} options={[{ value: "10", label: "1-in-10" }, { value: "50", label: "1-in-50" }, { value: "100", label: "1-in-100" }]} />
      <label className="field-label" htmlFor="sc-year">
        Year · {scenario.year} → horizon {horizon}
      </label>
      <input id="sc-year" type="range" min={2025} max={2100} step={5} value={scenario.year} onChange={(e) => upd({ year: Number(e.target.value) })} className="range" />
      <div className="muted small">≤ 2035 today · ≤ 2075 horizon 2050 · after that 2100</div>
      <label className="field-label" htmlFor="sc-pathway">
        Climate pathway
      </label>
      <select id="sc-pathway" className="select" value={scenario.pathway} onChange={(e) => upd({ pathway: e.target.value as Pathway })}>
        {(Object.keys(PATHWAY_LABEL) as Pathway[]).map((p) => (
          <option key={p} value={p}>
            {PATHWAY_LABEL[p]} · {PATHWAY_HINT[p]}
          </option>
        ))}
      </select>
      <SectionLabel>Compare against</SectionLabel>
      <div className="mini-card">
        <div>
          <span className="ab-pill ab-b">B</span> {solutionSet.label}
          {solutionSet.placements.length ? <span className="muted"> · {solutionSet.placements.length} placed</span> : null}
        </div>
        <Link href="/solutions" className="small">
          {solutionSet.placements.length ? "Change in Solutions →" : "Choose solutions →"}
        </Link>
      </div>
      <button type="button" className="btn btn-primary btn-lg" disabled={!mayRun || !!busy} title={mayRun ? "Requests two runs of the ported chain: A do nothing, B with the placed solutions" : "Runs are requested on the admin side by a scientist or admin"} onClick={() => void runPair()}>
        {busy ?? "Run comparison"}
      </button>
      {!mayRun ? <div className="muted small">Runs are requested on the admin side by a signed-in scientist or admin.</div> : null}
      {error ? <div className="notice notice-error small">{error}</div> : null}
      <div className="muted small rail-bottom">From the run log · runs are requested on the admin side in Phase 1.</div>
    </>
  );

  const rows: { label: string; a: Bounds | null; b: Bounds | null; fmt: (n: number) => string }[] = [
    { label: "Area flooded (km²)", a: runA?.result?.totals.flooded_km2 ?? null, b: runB?.result?.totals.flooded_km2 ?? null, fmt: fmtKm2 },
    { label: "People affected", a: runA?.result?.totals.people_affected ?? null, b: runB?.result?.totals.people_affected ?? null, fmt: fmtPeople },
    { label: "Buildings in flood", a: runA?.result?.totals.buildings_wet ?? null, b: runB?.result?.totals.buildings_wet ?? null, fmt: fmtPeople },
    { label: "Direct loss (₹ crore)", a: runA?.result?.totals.damage_inr ?? null, b: runB?.result?.totals.damage_inr ?? null, fmt: fmtCrore },
    { label: "Expected annual damage", a: runA?.result?.annual?.ead_inr ?? null, b: runB?.result?.annual?.ead_inr ?? null, fmt: fmtCrore }
  ];
  const anyUnsigned = isUnsigned(runA) || isUnsigned(runB);

  const card = (
    <>
      <div className="card-head">
        <SectionLabel>A vs B</SectionLabel>
        <h1 className="card-title">
          {STUDIO_HAZARD_LABEL[scenario.hazard]} · 1-in-{scenario.rp} · {horizon}
        </h1>
        <div className="muted small">
          {runA ? (
            <>
              A: <span className="mono">{runA.id}</span> ({runEventLabel(runA)})
            </>
          ) : (
            "A: no run to the studio standard"
          )}
          {runB ? (
            <>
              {" "}
              · B: <span className="mono">{runB.id}</span>
            </>
          ) : (
            " · B: —"
          )}
          {runA && !pairMatches && runEventLabel(runA) !== `1-in-${scenario.rp} · ${horizon}` ? <span> · nearest signed-off run shown; a run for this exact scenario is requested on the admin side</span> : null}
          {anyUnsigned ? (
            <>
              {" "}
              <UnsignedChip />
            </>
          ) : null}
        </div>
      </div>
      <table className="ab-table">
        <thead>
          <tr>
            <th />
            <th className="num">A</th>
            <th className="num">B</th>
            <th className="num">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.a && r.b ? r.b.central - r.a.central : null;
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num" title={r.a ? `low ${r.fmt(r.a.low)} · high ${r.fmt(r.a.high)}` : undefined}>
                  {r.a ? r.fmt(r.a.central) : DASH}
                </td>
                <td className="num" title={r.b ? `low ${r.fmt(r.b.low)} · high ${r.fmt(r.b.high)}` : undefined}>
                  {r.b ? r.fmt(r.b.central) : DASH}
                </td>
                <td className={`num${d !== null && d < 0 ? " delta-good" : d !== null && d > 0 ? " delta-bad" : ""}`}>{d === null ? DASH : d === 0 ? "0" : `${d < 0 ? "−" : "+"}${r.fmt(Math.abs(d))}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="muted small">Central values; low and high in the tooltip. Δ green when B is lower.</div>
      {runA ? <EvidenceLine run={runA} /> : null}
      {!modelled && !runA ? <NotModelledNotice reason={reason} compact /> : null}
      <SectionLabel>What the Meta Mind reads from this</SectionLabel>
      <GreyNote>{outlayB ? outlayB.summary : runB ? <span className="muted">Reading run B…</span> : DASH}</GreyNote>
      <div className="muted small">Chain: water level → damage → people → loss · {signedCount === null ? "—" : signedCount} of 4 models signed off</div>
      <div className="st-actions">
        <Link href="/admin/runs" className="btn">
          Open run log →
        </Link>
        <button type="button" className="btn" disabled title="Phase 2">
          Save scenario pair
        </button>
      </div>
    </>
  );

  return (
    <Layout view="scenarios" scale={null} rail={rail} railWidth={300} card={card} cardWidth={340}>
      <div className="swipe" ref={wrap}>
        <div className="swipe-pane">
          <StudioMap bounds={g.bounds} padding={20} onLoad={setMapA} onUnload={() => setMapA(null)} nav={false} />
        </div>
        <div className="swipe-pane" style={{ clipPath: `inset(0 0 0 ${split * 100}%)` }}>
          <StudioMap bounds={g.bounds} padding={20} onLoad={setMapB} onUnload={() => setMapB(null)} />
        </div>
        <div className="swipe-handle" style={{ left: `${split * 100}%` }} onPointerDown={onHandleDown} role="separator" aria-label="Swipe between A and B" aria-valuenow={Math.round(split * 100)}>
          <div className="swipe-grip">⇔</div>
        </div>
        <span className="ab-pill ab-a swipe-label-a">A · do nothing</span>
        <span className="ab-pill ab-b swipe-label-b">B · {solutionSet.label}</span>
        <div className="legend legend-strip">
          <Swatch color="var(--flood-shallow)" opacity={0.5} label="Flooded under 0.5 m" />
          <Swatch color="var(--flood-deep)" opacity={0.6} label="Flooded 0.5 m and over" />
          <Swatch kind="dot" color="var(--teal)" label="Solution placed" />
          <span className="legend-credit">
            {runA ? (
              <>
                Run A <span className="mono">{runA.id}</span>
              </>
            ) : (
              "Not yet modelled"
            )}
            {runB ? (
              <>
                {" "}
                · Run B <span className="mono">{runB.id}</span>
              </>
            ) : null}{" "}
            · {bm.name}
          </span>
        </div>
      </div>
    </Layout>
  );
}
