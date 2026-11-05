/** Risk view, City scale (artboard 0b): the Panaji footprint inside the Tiswadi frame, flood extent and wards only when the gate allows. */
import { useMemo, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { fmtKm2, fmtPeople, PATHWAY_LABEL } from "../admin/numbers";
import { Link, navigate } from "../router";
import { isUnsigned, runEventLabel, useExtent, useFetch, useRunDetail, useStudio, useZones } from "./data";
import { basemap, StudioMap, useGeoJson } from "./Map";
import { CRZ_COLOUR, CRZ_ORDER, useCityBase, useCityGeometry, useCrz, useCrzLayer, useExtentLayer, useZoneLayer, zonesWithClass } from "./cityLayers";
import { Layout, ScaleControl } from "./Shell";
import { BoundValue, CheckRow, DASH, EvidenceLine, GreyNote, Legend, NotModelledNotice, RiskChip, SectionLabel, StatTile, Swatch, UnsignedChip } from "./ui";
import { horizonOf, STUDIO_HAZARD_LABEL, type LayerResponse } from "./types";

export function RiskCity() {
  const { panjim, run, modelled, reason, previewOn, scenario, selectedZone, setSelectedZone } = useStudio();
  const [map, setMap] = useState<MLMap | null>(null);
  const [layers, setLayers] = useState({ wards: true, extent: true, relief: false, crz: false, khazans: false });
  const set = (k: keyof typeof layers) => (v: boolean) => setLayers((l) => ({ ...l, [k]: v }));

  const g = useCityGeometry();
  useCityBase(map, g);
  const crz = useCrz(layers.crz);
  useCrzLayer(map, crz.data?.data ?? null, layers.crz);
  const khazans = useFetch<LayerResponse>(previewOn && layers.khazans ? "/api/places/panjim/layers/khazan_polygons?admin=1" : null);
  useGeoJson(map, "khazans", khazans.data?.data ?? null, [{ id: "khazans-fill", type: "fill", paint: { "fill-color": "#2e7d4f", "fill-opacity": 0.18 } }, { id: "khazans-line", type: "line", paint: { "line-color": "#2e7d4f", "line-width": 1, "line-dasharray": [2, 1] } }], previewOn && layers.khazans);

  const extent = useExtent(run, previewOn);
  useExtentLayer(map, extent.data?.data ?? null, layers.extent && modelled);

  const zones = useZones(run, previewOn);
  const zoneGeom = useFetch<LayerResponse>(previewOn ? "/api/places/panjim/layers/ward_zones?admin=1" : null);
  const classById = useMemo(() => (zones.data ? new Map(zones.data.zones.map((z) => [z.id, z.rank_class])) : null), [zones.data]);
  const zonesFc = useMemo<FeatureCollection | null>(() => (previewOn ? zonesWithClass(zoneGeom.data?.data ?? null, classById, selectedZone) : null), [previewOn, zoneGeom.data, classById, selectedZone]);
  useZoneLayer(map, zonesFc, layers.wards && !!classById);
  const haveWards = previewOn && !!zones.data && !!zoneGeom.data;

  const detail = useRunDetail(modelled && run ? run.id : null);
  const unsigned = isUnsigned(run);
  const bm = basemap();
  const inv = panjim?.inventory ?? [];
  const count = (s: string) => inv.filter((r) => r.status === s).length;
  const scenarioLine = run
    ? `${STUDIO_HAZARD_LABEL[run.plan.scenario.hazard]} · ${runEventLabel(run)} · ${PATHWAY_LABEL[run.plan.scenario.pathway]} · ${run.plan.scenario.solution_set.label}`
    : `${STUDIO_HAZARD_LABEL[scenario.hazard]} · 1-in-${scenario.rp} · ${horizonOf(scenario.year)} · ${PATHWAY_LABEL[scenario.pathway]} · do nothing`;

  const rail = (
    <>
      <SectionLabel>Scale</SectionLabel>
      <ScaleControl scale="city" />
      <SectionLabel>Layers</SectionLabel>
      <div className="rail-rows">
        <CheckRow label="Combined risk by ward" checked={layers.wards} onChange={set("wards")} disabled={!haveWards} hint={previewOn ? (modelled ? "zones not loaded" : "not yet modelled") : "Ward boundaries: awaiting the CCP shapefile"} />
        <CheckRow label="Flood extent" checked={layers.extent} onChange={set("extent")} disabled={!modelled} hint="not yet modelled" />
        <CheckRow label="Relief centres / hospitals" checked={layers.relief} onChange={set("relief")} disabled hint="DDMP positions not supplied" />
        <CheckRow label="CRZ lines" checked={layers.crz} onChange={set("crz")} />
        <CheckRow label="Khazans" checked={layers.khazans} onChange={set("khazans")} disabled={!previewOn} hint="placeholder, admin-only" />
      </div>
      <SectionLabel>Scenario</SectionLabel>
      <div className="mini-card">
        <div>{scenarioLine}</div>
        {!run ? <div className="muted small">not yet run to the studio standard</div> : null}
        <Link href="/scenarios" className="small">
          Change →
        </Link>
      </div>
      <GreyNote title="Panjim place pack" className="rail-bottom">
        {panjim ? (
          <>
            {inv.length} layers · {count("supplied")} supplied · {count("derived")} derived · {count("placeholder")} placeholder · {count("not_yet_supplied")} not yet supplied
            <div className="muted" style={{ marginTop: 4 }}>
              Terrain: DeltaDTM v1.1 · Boundary: Census 2001 town footprint until the CCP shapefile · updated {panjim.manifest.updated_at}
            </div>
          </>
        ) : (
          <span className="muted">Place pack manifest not loaded</span>
        )}
      </GreyNote>
    </>
  );

  const card = (
    <>
      <div className="card-head">
        <SectionLabel>City</SectionLabel>
        <h1 className="card-title">Panjim</h1>
        <div className="muted">Corporation of the City of Panaji · pilot</div>
      </div>
      <div className="stat-tiles">
        <StatTile label="People in extent" value={modelled && run?.result ? <BoundValue v={run.result.totals.people_affected} fmt={fmtPeople} /> : DASH} sub={modelled ? runEventLabel(run) : "not yet modelled"} unsigned={modelled && unsigned} />
        <StatTile label="Area flooded" value={modelled && run?.result ? <BoundValue v={run.result.totals.flooded_km2} fmt={fmtKm2} /> : DASH} sub={modelled ? "km² · central, low–high" : "not yet modelled"} unsigned={modelled && unsigned} />
        <StatTile label="Relief centres dry" value={DASH} sub="no DDMP positions" />
      </div>
      {modelled ? <EvidenceLine run={run} /> : null}
      <SectionLabel>Wards ranked by risk</SectionLabel>
      {haveWards && zones.data ? (
        <>
          <div className="small muted" title={zones.data.method}>
            Placeholder zones · rank among zones, not a sourced rating <UnsignedChip />
          </div>
          <ol className="ranked">
            {zones.data.zones.map((z) => (
              <li key={z.id} className={`ranked-row is-link${selectedZone === z.id ? " is-selected" : ""}`} onClick={() => setSelectedZone(z.id)}>
                <span className="ranked-n">{z.rank}</span>
                <span className="ranked-name">{z.name}</span>
                <RiskChip cls={z.rank_class} rank />
                <span className="ranked-val" title="people in flooded cells, central bound">
                  {fmtPeople(z.people_in_flood)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="muted">Ward boundaries: awaiting the CCP shapefile</div>
      )}
      <SectionLabel>City-level read</SectionLabel>
      {modelled ? (
        <GreyNote>
          {detail.data ? (
            <>
              <div>{detail.data.outlay.summary}</div>
              {detail.data.outlay.references.length ? (
                <ul className="note-list" style={{ marginTop: 6 }}>
                  {detail.data.outlay.references.map((r) => (
                    <li key={r.path} className="muted">
                      {r.label} · <span className="mono">{r.path}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="muted small" style={{ marginTop: 6 }}>
                Meta Mind reading of run <span className="mono">{detail.data.run.id}</span>: text and references, never numbers of its own.
              </div>
            </>
          ) : detail.error ? (
            <span className="muted">Reading not available: {detail.error}</span>
          ) : (
            <span className="muted">Reading the run…</span>
          )}
        </GreyNote>
      ) : (
        <NotModelledNotice reason={reason} compact />
      )}
      <button type="button" className="btn btn-primary btn-lg st-cta" disabled={!haveWards} title={haveWards ? undefined : "Ward boundaries: awaiting the CCP shapefile"} onClick={() => navigate("/risk/ward")}>
        Open ward →
      </button>
    </>
  );

  return (
    <Layout view="risk" scale="city" rail={rail} card={card}>
      <StudioMap bounds={g.bounds} padding={20} onLoad={setMap} onUnload={() => setMap(null)}>
        <Legend title={modelled && run ? `Combined risk by ward · ${STUDIO_HAZARD_LABEL[run.plan.scenario.hazard]} · ${runEventLabel(run)}` : "Not yet modelled"}>
          {modelled ? (
            <>
              <Swatch color="var(--flood-shallow)" opacity={0.5} label="Flooded under 0.5 m" />
              <Swatch color="var(--flood-deep)" opacity={0.6} label="Flooded 0.5 m and over" />
              <Swatch kind="dash" color="var(--ink)" label="Khazan / field land behind bunds" />
            </>
          ) : null}
          {haveWards ? (
            <>
              <Swatch color="var(--risk-4)" label="Very high (rank among zones)" />
              <Swatch color="var(--risk-1)" label="Low (rank among zones)" />
            </>
          ) : null}
          <Swatch kind="line" color="var(--teal)" label="Panaji footprint (Census 2001)" />
          <Swatch kind="line" color="var(--green)" label="Field bunds (traced)" />
          {layers.crz ? CRZ_ORDER.map((k) => <Swatch key={k} kind="line" color={CRZ_COLOUR[k]} label={`${k} · ${crz.data?.classes[k] ?? ""}`} />) : null}
          <div className="legend-credit">
            {run ? (
              <>
                Run <span className="mono">{run.id}</span>
                {unsigned ? " · unsigned" : ""} ·{" "}
              </>
            ) : null}
            DeltaDTM terrain · Basemap: {bm.name} · {bm.credit}
          </div>
        </Legend>
      </StudioMap>
    </Layout>
  );
}
