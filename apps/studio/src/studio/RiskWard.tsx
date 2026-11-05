/** Risk view, Ward scale (artboard 1): the city footprint; in admin preview the placeholder zones shaded by rank, one selected; the risk-rating card. */
import { useEffect, useMemo, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { isUnsigned, runEventLabel, useExtent, useFetch, useStudio, useZones } from "./data";
import { basemap, centroidOf, StudioMap, useGeoJson, useMarkers, type MarkerDef } from "./Map";
import { rankClasses, RISK_HEX, useCityBase, useCityGeometry, useCrz, useCrzLayer, useExtentLayer, useZoneLayer, zonesWithClass } from "./cityLayers";
import { RiskCard, type ShowAs } from "./RiskCard";
import { Layout, ScaleControl } from "./Shell";
import { CheckRow, GreyNote, Legend, SectionLabel, Segmented, Swatch } from "./ui";
import { STUDIO_HAZARD_LABEL, type LayerResponse } from "./types";

export function RiskWard() {
  const { panjim, run, modelled, reason, previewOn, selectedZone, setSelectedZone } = useStudio();
  const [map, setMap] = useState<MLMap | null>(null);
  const [showAs, setShowAs] = useState<ShowAs>("combined");
  const [layers, setLayers] = useState({ hazard: true, exposure: false, vulnerability: false, slr: false, mangroves: false, khazans: false });
  const set = (k: keyof typeof layers) => (v: boolean) => setLayers((l) => ({ ...l, [k]: v }));

  const g = useCityGeometry();
  useCityBase(map, g);
  const crz = useCrz(layers.mangroves);
  useCrzLayer(map, crz.data?.data ?? null, layers.mangroves, { fillClass: "M", lines: false });
  const khazans = useFetch<LayerResponse>(previewOn && layers.khazans ? "/api/places/panjim/layers/khazan_polygons?admin=1" : null);
  useGeoJson(map, "khazans", khazans.data?.data ?? null, [{ id: "khazans-fill", type: "fill", paint: { "fill-color": "#2e7d4f", "fill-opacity": 0.18 } }], previewOn && layers.khazans);
  const extent = useExtent(run, previewOn);
  useExtentLayer(map, extent.data?.data ?? null, layers.hazard && modelled);

  const zones = useZones(run, previewOn);
  const zoneGeom = useFetch<LayerResponse>(previewOn ? "/api/places/panjim/layers/ward_zones?admin=1" : null);
  const zoneList = useMemo(() => zones.data?.zones ?? [], [zones.data]);
  const classById = useMemo(() => {
    if (!zoneList.length) return null;
    if (showAs === "combined") return new Map(zoneList.map((z) => [z.id, z.rank_class]));
    if (showAs === "H") return rankClasses(zoneList, (z) => z.depth_mean_m ?? 0);
    if (showAs === "E") return rankClasses(zoneList, (z) => z.people_total + z.buildings_total);
    return rankClasses(zoneList, (z) => z.svi_higher_share);
  }, [zoneList, showAs]);
  const zonesFc = useMemo<FeatureCollection | null>(() => (previewOn ? zonesWithClass(zoneGeom.data?.data ?? null, classById, selectedZone) : null), [previewOn, zoneGeom.data, classById, selectedZone]);
  useZoneLayer(map, zonesFc, true);
  const haveWards = previewOn && zoneList.length > 0 && !!zoneGeom.data;

  // default to the top-ranked zone once zones exist
  useEffect(() => {
    if (haveWards && (!selectedZone || !zoneList.some((z) => z.id === selectedZone))) setSelectedZone(zoneList.find((z) => z.rank === 1)?.id ?? zoneList[0].id);
  }, [haveWards, zoneList, selectedZone, setSelectedZone]);

  const markers = useMemo<MarkerDef[]>(() => {
    if (!zonesFc) return [];
    return zonesFc.features.flatMap((f) => {
      const c = centroidOf(f as Feature);
      const id = String(f.properties?.id ?? "");
      return c ? [{ id, lngLat: c, className: `map-label map-label-zone${id === selectedZone ? " is-selected" : ""}`, text: String(f.properties?.name ?? id), onClick: () => setSelectedZone(id) }] : [];
    });
  }, [zonesFc, selectedZone, setSelectedZone]);
  useMarkers(map, markers);

  const onClick = (lngLat: { lng: number; lat: number }) => {
    if (!map || !haveWards) return;
    try {
      const hit = map.queryRenderedFeatures(map.project([lngLat.lng, lngLat.lat]), { layers: ["zones-fill"] })[0];
      if (hit?.properties?.id) setSelectedZone(String(hit.properties.id));
    } catch {
      /* layer not yet on the map */
    }
  };

  const zone = zoneList.find((z) => z.id === selectedZone) ?? null;
  const unsigned = isUnsigned(run);
  const bm = basemap();
  const m = panjim?.manifest;
  const corpus = m?.policy_corpus ?? [];
  const layerTitle = (id: string, fallback: string) => m?.layers.find((l) => l.id === id)?.title ?? fallback;

  const rail = (
    <>
      <SectionLabel>Scale</SectionLabel>
      <ScaleControl scale="ward" />
      <SectionLabel>Layers</SectionLabel>
      <div className="rail-rows">
        <CheckRow label="Hazard · water level" tag="model" checked={layers.hazard} onChange={set("hazard")} disabled={!modelled} hint="not yet modelled" />
        <CheckRow label="Exposure · buildings, roads" tag="data" checked={layers.exposure} onChange={set("exposure")} disabled hint="exposure grid is not served as a studio layer" />
        <CheckRow label="Vulnerability · people" tag="model" checked={layers.vulnerability} onChange={set("vulnerability")} disabled hint="shown in the card as the zone's SVI share" />
        <CheckRow label="Sea-level rise 2050" tag="model" checked={layers.slr} onChange={set("slr")} disabled hint="part of the run's horizon; no separate layer yet" />
        <CheckRow label="Mangroves (CRZ-IA)" tag="data" checked={layers.mangroves} onChange={set("mangroves")} />
        <CheckRow label="Khazans" tag="data" checked={layers.khazans} onChange={set("khazans")} disabled={!previewOn} hint="placeholder, admin-only" />
      </div>
      <SectionLabel>Show risk as</SectionLabel>
      <Segmented<ShowAs>
        ariaLabel="Show risk as"
        value={showAs}
        onChange={setShowAs}
        options={[
          { value: "combined", label: "Combined" },
          { value: "H", label: "H", title: "Hazard: mean depth in the zone" },
          { value: "E", label: "E", title: "Exposure: people and buildings in the zone" },
          { value: "V", label: "V", title: "Vulnerability: share of cells in the higher SVI class" }
        ]}
      />
      <div className="muted small">Every class is a rank among zones for this run, not a sourced grade.</div>
      <GreyNote title="Base data for this place" className="rail-bottom">
        <ul className="note-list">
          <li>Terrain: {layerTitle("terrain_deltadtm", "DeltaDTM")}</li>
          <li>Buildings: {layerTitle("exposure_buildings", "OSM + Microsoft")}</li>
          <li>{layerTitle("population_census2011", "Population: Census 2011 (fallback)")}</li>
          <li>
            Policy corpus: {corpus.length} documents ({corpus.filter((c) => c.status === "supplied").length} supplied)
          </li>
        </ul>
      </GreyNote>
    </>
  );

  const card = <RiskCard zone={zone} zones={zoneList} run={run} modelled={modelled} reason={reason} unsigned={unsigned} cls={zone ? (classById?.get(zone.id) ?? zone.rank_class) : null} showAs={showAs} />;

  return (
    <Layout view="risk" scale="ward" wardName={zone?.name ?? null} rail={rail} card={card} cardWidth={360}>
      <StudioMap bounds={g.cityBounds ?? g.bounds} padding={24} onLoad={setMap} onUnload={() => setMap(null)} onClick={onClick}>
        {!haveWards ? <div className="map-note">Ward boundaries: awaiting the CCP shapefile (spec §7, item 5){previewOn && !modelled ? " · not yet modelled" : ""}</div> : null}
        <Legend title={modelled && run ? `${showAs === "combined" ? "Combined risk" : showAs === "H" ? "Hazard" : showAs === "E" ? "Exposure" : "Vulnerability"} · ${STUDIO_HAZARD_LABEL[run.plan.scenario.hazard]} · ${runEventLabel(run)}` : "Not yet modelled"}>
          {haveWards ? ([4, 3, 2, 1] as const).map((k) => <Swatch key={k} color={RISK_HEX[k]} label={`${k === 4 ? "Very high" : k === 3 ? "High" : k === 2 ? "Moderate" : "Low"} · rank among zones`} />) : null}
          {modelled && layers.hazard ? (
            <>
              <Swatch color="var(--flood-shallow)" opacity={0.5} label="Flooded under 0.5 m" />
              <Swatch color="var(--flood-deep)" opacity={0.6} label="Flooded 0.5 m and over" />
            </>
          ) : null}
          {layers.mangroves ? <Swatch color="#e9a96b" opacity={0.35} label="Mangroves · CRZ-IA (CZMP, reasoned)" /> : null}
          <Swatch kind="line" color="var(--teal)" label="Panaji footprint (Census 2001)" />
          <div className="legend-credit">
            {run ? (
              <>
                Run <span className="mono">{run.id}</span> ·{" "}
              </>
            ) : null}
            DeltaDTM terrain · Basemap: {bm.name} · {bm.credit}
          </div>
        </Legend>
      </StudioMap>
    </Layout>
  );
}
