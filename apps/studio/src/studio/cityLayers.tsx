/**
 * The Panjim geometry every city-scale map draws (Tiswadi frame, the Census 2001 Panaji footprint, the traced field
 * bunds), the CRZ classes, the flood extent of a run, and the placeholder ward zones (admin preview only).
 */
import { useMemo } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { useFetch } from "./data";
import { bboxOf, padBounds, useGeoJson } from "./Map";
import type { CrzResponse, LayerResponse, ZoneStats } from "./types";

export interface CityGeometry {
  frame: FeatureCollection | null;
  city: FeatureCollection | null;
  bunds: FeatureCollection | null;
  /** the city footprint padded, or the frame, or the manifest bbox */
  bounds: [number, number, number, number];
  cityBounds: [number, number, number, number] | null;
  error: string | null;
}

export function useCityGeometry(): CityGeometry {
  const frame = useFetch<{ data: FeatureCollection }>("/api/places/panjim/frame/tiswadi");
  const city = useFetch<LayerResponse>("/api/places/panjim/layers/city_boundary");
  const bunds = useFetch<LayerResponse>("/api/places/panjim/layers/field_bunds");
  const cityBounds = useMemo(() => bboxOf(city.data?.data), [city.data]);
  const bounds = useMemo<[number, number, number, number]>(() => (cityBounds ? padBounds(cityBounds, 0.18) : [73.76, 15.45, 73.9, 15.53]), [cityBounds]);
  return { frame: frame.data?.data ?? null, city: city.data?.data ?? null, bunds: bunds.data?.data ?? null, bounds, cityBounds, error: city.error };
}

/** Frame outline (muted), city footprint (teal outline), field bunds (thin green outline). */
export function useCityBase(map: MLMap | null, g: CityGeometry, opts: { bunds?: boolean; prefix?: string } = {}) {
  const p = opts.prefix ?? "";
  useGeoJson(map, `${p}frame`, g.frame, [
    { id: `${p}frame-fill`, type: "fill", paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 } },
    { id: `${p}frame-line`, type: "line", paint: { "line-color": "#5b6468", "line-width": 1, "line-dasharray": [3, 2] } }
  ]);
  useGeoJson(map, `${p}city`, g.city, [
    { id: `${p}city-fill`, type: "fill", paint: { "fill-color": "#0f6e76", "fill-opacity": 0.05 } },
    { id: `${p}city-line`, type: "line", paint: { "line-color": "#0f6e76", "line-width": 2 } }
  ]);
  useGeoJson(
    map,
    `${p}bunds`,
    g.bunds,
    [{ id: `${p}bunds-line`, type: "line", paint: { "line-color": "#2e7d4f", "line-width": 1, "line-opacity": 0.9 } }],
    opts.bunds ?? true
  );
}

/** CRZ classes (CZMP Goa, 55 m grid, reasoned_extrapolation): code → colour. */
export const CRZ_COLOUR: Record<string, string> = { M: "#2e7d4f", U: "#5b6468", N: "#d55a1f", T: "#e9a96b", S: "#4a8fb5", R: "#2d6a8e", W: "#8fb5c4" };
export const CRZ_ORDER = ["M", "U", "N", "T", "S", "R", "W"];

export function useCrz(enabled: boolean) {
  return useFetch<CrzResponse>(enabled ? "/api/places/panjim/crz_classes" : null);
}

const crzColourExpr = ["match", ["get", "crz_class"], ...CRZ_ORDER.flatMap((k) => [k, CRZ_COLOUR[k]]), "#9aa4a8"] as unknown as string;

/** CRZ class outlines (lines) and, when `fillClass` is given, that class shaded. */
export function useCrzLayer(map: MLMap | null, data: FeatureCollection | null, visible: boolean, opts: { prefix?: string; fillClass?: string; lines?: boolean } = {}) {
  const p = opts.prefix ?? "";
  const fill = opts.fillClass;
  const layers = [
    ...(fill ? [{ id: `${p}crz-fill`, type: "fill" as const, filter: ["==", ["get", "crz_class"], fill], paint: { "fill-color": "#e9a96b", "fill-opacity": 0.35 } }] : []),
    ...(opts.lines === false ? [] : [{ id: `${p}crz-line`, type: "line" as const, filter: ["!=", ["get", "crz_class"], "."], paint: { "line-color": crzColourExpr, "line-width": 1, "line-opacity": 0.9 } }])
  ];
  useGeoJson(map, `${p}crz`, data, layers, visible);
}

/** Flood extent of a run: band 1 light blue (under 0.5 m), band 2 deep blue (0.5 m and over); bunded land dashed. */
export function useExtentLayer(map: MLMap | null, data: FeatureCollection | null, visible: boolean, prefix = "") {
  const p = prefix;
  useGeoJson(
    map,
    `${p}extent`,
    data,
    [
      { id: `${p}extent-fill`, type: "fill", paint: { "fill-color": ["case", ["==", ["get", "band"], 2], "#2d6a8e", "#4a8fb5"], "fill-opacity": ["case", ["==", ["get", "band"], 2], 0.6, 0.5] } },
      { id: `${p}extent-bunded`, type: "line", filter: ["==", ["get", "bunded"], true], paint: { "line-color": "#1a1d1f", "line-width": 1, "line-dasharray": [2, 2], "line-opacity": 0.8 } }
    ],
    visible
  );
}

export const RISK_HEX: Record<1 | 2 | 3 | 4, string> = { 1: "#d9e6ec", 2: "#f3d3a6", 3: "#e9a96b", 4: "#d55a1f" };

/** The placeholder ward zones joined to a class per zone id (rank among zones). */
export function zonesWithClass(zones: FeatureCollection | null, cls: Map<string, 1 | 2 | 3 | 4> | null, selected: string | null): FeatureCollection | null {
  if (!zones) return null;
  return {
    type: "FeatureCollection",
    features: zones.features.map((f) => {
      const id = String(f.properties?.id ?? "");
      return { ...f, properties: { ...f.properties, cls: cls?.get(id) ?? 0, selected: id === selected } };
    })
  };
}

export function useZoneLayer(map: MLMap | null, data: FeatureCollection | null, visible: boolean, prefix = "") {
  const p = prefix;
  useGeoJson(
    map,
    `${p}zones`,
    data,
    [
      { id: `${p}zones-fill`, type: "fill", paint: { "fill-color": ["match", ["get", "cls"], 1, RISK_HEX[1], 2, RISK_HEX[2], 3, RISK_HEX[3], 4, RISK_HEX[4], "#ffffff"], "fill-opacity": ["case", ["==", ["get", "cls"], 0], 0.15, 0.55] } },
      { id: `${p}zones-line`, type: "line", paint: { "line-color": "#ffffff", "line-width": 1 } },
      { id: `${p}zones-selected`, type: "line", filter: ["==", ["get", "selected"], true], paint: { "line-color": "#0f6e76", "line-width": 3 } }
    ],
    visible
  );
}

/** Quartile rank class of zones by a measure: 4 = top quarter. A rank among zones, never a sourced grade. */
export function rankClasses(zones: ZoneStats[], measure: (z: ZoneStats) => number): Map<string, 1 | 2 | 3 | 4> {
  const sorted = [...zones].sort((a, b) => measure(b) - measure(a));
  const out = new Map<string, 1 | 2 | 3 | 4>();
  // a zone where the measure is zero ranks lowest whatever its position: nothing was measured there
  sorted.forEach((z, k) => out.set(z.id, measure(z) > 0 ? ((4 - Math.min(3, Math.floor((k / sorted.length) * 4))) as 1 | 2 | 3 | 4) : 1));
  return out;
}
