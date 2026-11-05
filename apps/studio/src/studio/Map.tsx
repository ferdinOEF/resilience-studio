/**
 * One MapLibre map per view. Basemap: Esri World Imagery when VITE_ARCGIS_API_KEY is set, otherwise the EOX
 * Sentinel-2 cloudless 2020 WMTS; a light scrim sits over the imagery so the teal and orange overlays read.
 * Labels are HTML markers (no glyph server needed); overlays are GeoJSON sources added by useGeoJson().
 */
import maplibregl, { type LayerSpecification, type LngLatBoundsLike, type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, type ReactNode } from "react";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export interface Basemap {
  name: string;
  credit: string;
  style: StyleSpecification;
}

export function basemap(): Basemap {
  const key = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
  const esri = !!key;
  const tiles = esri
    ? [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${key}`]
    : ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"];
  const attribution = esri ? "Esri, Maxar, Earthstar Geographics, and the GIS User Community" : "Sentinel-2 cloudless 2020 by EOX IT Services GmbH, CC BY 4.0";
  return {
    name: esri ? "Esri World Imagery" : "Sentinel-2 cloudless 2020 (EOX)",
    credit: attribution,
    style: {
      version: 8,
      sources: { imagery: { type: "raster", tiles, tileSize: 256, maxzoom: esri ? 19 : 15, attribution } },
      layers: [
        { id: "sea", type: "background", paint: { "background-color": "#cfe0e6" } },
        { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": -0.35, "raster-brightness-max": 0.95 } },
        { id: "scrim", type: "background", paint: { "background-color": "#ffffff", "background-opacity": 0.42 } }
      ]
    }
  };
}

export interface StudioMapProps {
  /** fit these bounds (lon/lat) whenever they change */
  bounds?: LngLatBoundsLike | null;
  padding?: number;
  /** called once the style has loaded; the parent stores the map and feeds it to the hooks */
  onLoad: (map: MLMap) => void;
  onUnload?: () => void;
  onClick?: (lngLat: { lng: number; lat: number }) => void;
  nav?: boolean;
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}

export function StudioMap({ bounds, padding = 40, onLoad, onUnload, onClick, nav = true, interactive = true, className, children }: StudioMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const loadRef = useRef(onLoad);
  loadRef.current = onLoad;
  const unloadRef = useRef(onUnload);
  unloadRef.current = onUnload;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  useEffect(() => {
    if (!el.current) return;
    const bm = basemap();
    const map = new maplibregl.Map({ container: el.current, style: bm.style, center: [73.83, 15.49], zoom: 11, attributionControl: false, interactive, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0 });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    if (nav) map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    // a tile that does not load is not an error for the studio (the smoke test runs offline)
    map.on("error", (e) => {
      const msg = String((e as { error?: { message?: string } }).error?.message ?? "");
      if (!/tile|AJAX|fetch|network|abort/i.test(msg)) console.warn("map:", msg);
    });
    map.on("click", (e) => clickRef.current?.(e.lngLat));
    map.on("load", () => {
      mapRef.current = map;
      if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: paddingRef.current, duration: 0 });
      loadRef.current(map);
    });
    return () => {
      mapRef.current = null;
      unloadRef.current?.();
      map.remove();
    };
  }, [interactive, nav]);

  const boundsKey = bounds ? JSON.stringify(bounds) : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding, duration: 0 });
  }, [boundsKey, padding]);

  return (
    <div className={`st-map${className ? " " + className : ""}`}>
      <div ref={el} className="st-map-canvas" />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ hooks */

/** A layer of a GeoJSON source; cast when added (LayerSpecification is a union that Omit<> cannot narrow). */
type LayerDef = { id: string; type: "fill" | "line" | "circle" | "symbol"; filter?: unknown; layout?: Record<string, unknown>; paint?: Record<string, unknown>; minzoom?: number; maxzoom?: number };

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Draw order of the studio's sources, bottom to top (a prefix such as "a-" names the map, not the order). */
const Z_ORDER = ["talukas", "frame", "zones", "khazans", "crz", "extent", "city", "bunds"];
const stacks = new WeakMap<MLMap, Map<string, string[]>>();

/** Keep the sources in Z_ORDER whatever order their data arrived: move every known layer to the top, lowest rank first. */
function restack(map: MLMap, sourceId: string, layerIds: string[]) {
  let known = stacks.get(map);
  if (!known) stacks.set(map, (known = new Map()));
  known.set(sourceId, layerIds);
  const rank = (id: string) => {
    const k = Z_ORDER.indexOf(id.replace(/^[a-z]-/, ""));
    return k < 0 ? Z_ORDER.length : k;
  };
  const ordered = [...known.keys()].sort((a, b) => rank(a) - rank(b));
  for (const src of ordered) for (const l of known.get(src) ?? []) safe(() => map.getLayer(l) && map.moveLayer(l));
}

/**
 * Keep one GeoJSON source and its layers on the map. The layers are added in the order given; a later hook's layers
 * sit above an earlier hook's. `visible` toggles every layer of the source.
 */
export function useGeoJson(map: MLMap | null, id: string, data: FeatureCollection | null, layers: LayerDef[], visible = true) {
  const layersRef = useRef(layers);
  layersRef.current = layers;
  useEffect(() => {
    if (!map || !data) return;
    const defs = layersRef.current;
    if (safe(() => map.getSource(id))) {
      (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);
    } else {
      safe(() => map.addSource(id, { type: "geojson", data }));
      for (const l of defs) safe(() => map.addLayer({ ...(l as LayerSpecification), source: id } as LayerSpecification));
      restack(map, id, defs.map((l) => l.id));
    }
    return () => {
      for (const l of defs) safe(() => map.getLayer(l.id) && map.removeLayer(l.id));
      safe(() => map.getSource(id) && map.removeSource(id));
    };
  }, [map, id, data]);
  useEffect(() => {
    if (!map || !data) return;
    for (const l of layersRef.current) safe(() => map.getLayer(l.id) && map.setLayoutProperty(l.id, "visibility", visible ? "visible" : "none"));
  }, [map, data, visible]);
}

export interface MarkerDef {
  id: string;
  lngLat: [number, number];
  className: string;
  text?: string;
  title?: string;
  onClick?: () => void;
}

/** HTML markers for labels and dots (the style has no glyphs). Re-created when the list changes. */
export function useMarkers(map: MLMap | null, markers: MarkerDef[]) {
  const key = JSON.stringify(markers.map((m) => [m.id, m.lngLat, m.className, m.text, m.title]));
  const defsRef = useRef(markers);
  defsRef.current = markers;
  useEffect(() => {
    if (!map) return;
    const made = defsRef.current.map((m) => {
      const el = document.createElement("div");
      el.className = m.className;
      if (m.text) el.textContent = m.text;
      if (m.title) el.title = m.title;
      if (m.onClick) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          m.onClick?.();
        });
      }
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(m.lngLat).addTo(map);
    });
    return () => made.forEach((mk) => mk.remove());
  }, [map, key]);
}

/* ------------------------------------------------------------------ geometry helpers */

export function bboxOf(fc: FeatureCollection | Feature | Geometry | null | undefined): [number, number, number, number] | null {
  if (!fc) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [x, y] = c as Position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else for (const k of c) walk(k);
  };
  const geom = (g: Geometry | null) => {
    if (!g) return;
    if (g.type === "GeometryCollection") g.geometries.forEach(geom);
    else walk((g as { coordinates: unknown }).coordinates);
  };
  if (fc.type === "FeatureCollection") fc.features.forEach((f) => geom(f.geometry));
  else if (fc.type === "Feature") geom(fc.geometry);
  else geom(fc);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function centroidOf(f: Feature | Geometry | null | undefined): [number, number] | null {
  const b = bboxOf(f as Feature);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

export function padBounds(b: [number, number, number, number], f: number): [number, number, number, number] {
  const dx = (b[2] - b[0]) * f, dy = (b[3] - b[1]) * f;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}
