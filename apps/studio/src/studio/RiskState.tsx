/** Risk view, State scale (artboard 0a): Goa's talukas (GADM), Tiswadi as the pilot, one place dot per place in /api/places. */
import { useMemo, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import type { Hazard } from "../admin/types";
import { HAZARDS } from "../admin/types";
import { fmtPeople } from "../admin/numbers";
import { Link } from "../router";
import { isUnsigned, runEventLabel, useFetch, useStudio } from "./data";
import { basemap, bboxOf, centroidOf, padBounds, StudioMap, useGeoJson, useMarkers, type MarkerDef } from "./Map";
import { Layout, ScaleControl } from "./Shell";
import { BoundValue, DASH, GreyNote, Legend, NotModelledNotice, RadioRow, SectionLabel, StatTile, Swatch, UnsignedChip } from "./ui";
import { STUDIO_HAZARD_LABEL, type LayerResponse } from "./types";

/** GADM's taluka names and the usual ones (data/national/manifest.json, gadm_goa_talukas). */
const USUAL_NAME: Record<string, string> = { Panaji: "Tiswadi", Mapuca: "Bardez", Madgaon: "Salcete", Sambaji: "Mormugao", Valpoy: "Sattari", Dicholi: "Bicholim", Chauri: "Canacona" };
const PILOT_TALUKA = "Panaji";

type ShowMode = "combined" | "hazard" | "people" | "coverage";
const SHOW_LABEL: Record<ShowMode, string> = { combined: "Combined risk", hazard: "Hazard only", people: "People exposed", coverage: "Data coverage" };

export function RiskState() {
  const { india, places, panjim, runs, run, modelled, reason, hazard, setHazard, previewOn } = useStudio();
  const [map, setMap] = useState<MLMap | null>(null);
  const [show, setShow] = useState<ShowMode>("combined");
  const talukas = useFetch<LayerResponse>("/api/places/india/layers/gadm_goa_talukas");
  const fc = talukas.data?.data ?? null;

  const bounds = useMemo(() => {
    const b = bboxOf(fc);
    return b ? padBounds(b, 0.08) : ([73.3, 14.85, 74.4, 15.85] as [number, number, number, number]);
  }, [fc]);

  const styled = useMemo<FeatureCollection | null>(() => {
    if (!fc) return null;
    return { type: "FeatureCollection", features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, pilot: f.properties?.NAME_3 === PILOT_TALUKA } })) };
  }, [fc]);

  useGeoJson(map, "talukas", styled, [
    { id: "talukas-fill", type: "fill", paint: { "fill-color": ["case", ["get", "pilot"], "#0f6e76", "#ffffff"], "fill-opacity": ["case", ["get", "pilot"], 0.28, 0.16] } },
    { id: "talukas-line", type: "line", paint: { "line-color": "#1a1d1f", "line-width": 1, "line-opacity": 0.55 } },
    { id: "talukas-pilot-line", type: "line", filter: ["==", ["get", "pilot"], true], paint: { "line-color": "#0f6e76", "line-width": 2 } }
  ]);

  const panjimCentre = useMemo<[number, number]>(() => {
    const b = panjim?.manifest.bbox;
    return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [73.83, 15.49];
  }, [panjim]);

  const markers = useMemo<MarkerDef[]>(() => {
    const out: MarkerDef[] = [{ id: "sea", lngLat: [73.55, 15.25], className: "map-label map-label-sea", text: "Arabian Sea" }];
    for (const f of fc?.features ?? []) {
      const name3 = String(f.properties?.NAME_3 ?? "");
      if (/^n\.a\./i.test(name3)) continue;
      const c = centroidOf(f as Feature);
      if (!c) continue;
      const pilot = name3 === PILOT_TALUKA;
      out.push({ id: `t-${name3}`, lngLat: pilot ? [c[0], c[1] + 0.035] : c, className: `map-label map-label-taluka${pilot ? " is-pilot" : ""}`, text: pilot ? `${USUAL_NAME[name3]} · pilot` : (USUAL_NAME[name3] ?? name3) });
    }
    // place dots: only places that exist in /api/places; their status comes from the gate
    for (const p of places.filter((x) => x.level === "city")) {
      const status = modelled ? "modelled" : "not-modelled";
      out.push({ id: `p-${p.id}`, lngLat: panjimCentre, className: `place-dot place-dot-${status}`, title: `${p.name}: ${modelled ? "modelled" : "not yet modelled"}` });
      out.push({ id: `pl-${p.id}`, lngLat: [panjimCentre[0] + 0.012, panjimCentre[1] - 0.012], className: "map-label map-label-place", text: "Panjim" });
    }
    return out;
  }, [fc, places, modelled, panjimCentre]);
  useMarkers(map, markers);

  const districts = useMemo(() => new Set((fc?.features ?? []).map((f) => f.properties?.NAME_2)).size, [fc]);
  const talukaCount = fc?.features.length ?? 0;
  const hazardOptions = HAZARDS.filter((h) => runs[h]);
  const cityPlaces = places.filter((p) => p.level === "city");
  const unsigned = isUnsigned(run);
  const bm = basemap();
  const eventLabel = run ? `${STUDIO_HAZARD_LABEL[run.plan.scenario.hazard]} · ${runEventLabel(run)}` : null;

  const rail = (
    <>
      <SectionLabel>Scale</SectionLabel>
      <ScaleControl scale="state" />
      <SectionLabel>Show</SectionLabel>
      <div className="rail-rows">
        {(Object.keys(SHOW_LABEL) as ShowMode[]).map((m) => (
          <RadioRow key={m} name="show" label={SHOW_LABEL[m]} value={m} current={show} onChange={(v) => setShow(v as ShowMode)} />
        ))}
      </div>
      <SectionLabel>Hazard</SectionLabel>
      <select className="select" value={hazardOptions.length ? (runs[hazard] ? hazard : hazardOptions[0]) : ""} onChange={(e) => setHazard(e.target.value as Hazard)} disabled={!hazardOptions.length} title={hazardOptions.length ? undefined : "No signed-off run yet: the four chain hazards appear here once the chain is signed off"}>
        {hazardOptions.length ? (
          hazardOptions.map((h) => (
            <option key={h} value={h}>
              {STUDIO_HAZARD_LABEL[h]} · {runEventLabel(runs[h]!)}
            </option>
          ))
        ) : (
          <>
            <option value="">No modelled hazard yet</option>
            {HAZARDS.map((h) => (
              <option key={h} value={h} disabled>
                {STUDIO_HAZARD_LABEL[h]} · not yet modelled
              </option>
            ))}
          </>
        )}
      </select>
      <GreyNote title="State base data" className="rail-bottom">
        {india ? (
          <ul className="note-list">
            {india.manifest.layers.map((l) => (
              <li key={l.id}>
                {l.title}
                <span className="muted"> · {l.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">National base data: GADM boundaries, Cartosat DEM, IMD cyclone tracks, Census 2011, SOI coastline (manifest not loaded)</span>
        )}
      </GreyNote>
    </>
  );

  const card = (
    <>
      <div className="card-head">
        <SectionLabel>State</SectionLabel>
        <h1 className="card-title">Goa</h1>
        <div className="muted">
          {fc ? `${districts} districts · ${talukaCount} talukas` : talukas.error ? "boundaries not loaded" : "loading boundaries…"}
        </div>
      </div>
      <div className="stat-tiles">
        <StatTile label="People in extent" value={modelled && run?.result ? <BoundValue v={run.result.totals.people_affected} fmt={fmtPeople} /> : DASH} sub={modelled ? eventLabel : "not yet modelled"} unsigned={modelled && unsigned} />
        <StatTile label="Modelled" value={modelled ? cityPlaces.length : 0} sub={`of ${cityPlaces.length} place${cityPlaces.length === 1 ? "" : "s"}`} />
        <StatTile label="Ready to run" value={modelled ? 0 : cityPlaces.length} sub="place pack, chain not signed off" />
      </div>
      <SectionLabel>Places</SectionLabel>
      <ol className="ranked">
        {cityPlaces.map((p, i) => (
          <li key={p.id} className="ranked-row">
            <span className="ranked-n">{i + 1}</span>
            <span className="ranked-name">Panjim</span>
            {modelled ? (
              <span className="chip-row">
                <span className="chip chip-modelled">modelled</span>
                {unsigned ? <UnsignedChip /> : null}
              </span>
            ) : (
              <span className="chip chip-not-modelled">not yet modelled</span>
            )}
            <span className="ranked-val muted" title="people in extent, central bound">{modelled && run?.result ? fmtPeople(run.result.totals.people_affected.central) : "—"}</span>
          </li>
        ))}
        {!cityPlaces.length ? <li className="muted small">{places.length ? "No city place pack" : "Places not loaded"}</li> : null}
      </ol>
      {!modelled ? <NotModelledNotice reason={reason} compact /> : null}
      <GreyNote>Results show only where modelling meets the studio standard: calibrated against a supplied event and signed off. Other talukas are drawn as boundaries only; no status is asserted for them.</GreyNote>
      <Link href="/risk/city" className="btn btn-primary btn-lg st-cta">
        Open Panjim →
      </Link>
    </>
  );

  return (
    <Layout view="risk" scale="state" rail={rail} card={card}>
      <StudioMap bounds={bounds} padding={24} onLoad={setMap} onUnload={() => setMap(null)}>
        <Legend className="legend-compact" title={modelled ? `${SHOW_LABEL[show]} · ${eventLabel}` : `${SHOW_LABEL[show]} · not yet modelled`}>
          {/* risk classes as one ramp, place status as one row: the card to the right carries the explanation */}
          <div className="legend-ramp" role="img" aria-label="Combined risk: low, moderate, high, very high">
            <span className="legend-ramp-label">Low</span>
            <span className="swatch" style={{ background: "var(--risk-1)" }} />
            <span className="swatch" style={{ background: "var(--risk-2)" }} />
            <span className="swatch" style={{ background: "var(--risk-3)" }} />
            <span className="swatch" style={{ background: "var(--risk-4)" }} />
            <span className="legend-ramp-label">Very high</span>
          </div>
          <div className="legend-inline">
            <Swatch kind="dot" color="var(--teal)" label="Modelled" />
            <Swatch kind="dot" color="var(--flood-shallow)" label="Ready to run" />
            <Swatch kind="dot" color="var(--not-modelled)" label="Not yet modelled" />
          </div>
          <div className="legend-note" title={modelled ? "Only places modelled to the studio standard show results." : `Panjim is not yet modelled to the studio standard: ${reason}.`}>
            {modelled ? "Only places modelled to the studio standard show results." : "Not yet modelled: results appear once the chain is calibrated and signed off."}
            {previewOn ? " Admin preview on." : ""}
          </div>
          <div className="legend-credit">
            Boundaries: GADM 4.1 · Basemap: {bm.name} · {bm.credit}
          </div>
        </Legend>
      </StudioMap>
    </Layout>
  );
}
