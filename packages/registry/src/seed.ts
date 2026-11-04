/**
 * Seed (spec section 3.3): every entry of the old registry (the Param objects in the ported data files, each with a
 * grounding tag and citations) becomes a registry entry with its citation and grounding tag intact, at the right level.
 * Nothing is promoted: every seeded row is `in_review` with the port as author, so approval stays a human act.
 */
import { CITATIONS, RAW_DATA, DATASETS } from "@resilience/core";
import { GROUNDINGS, versionId, type EntryKind, type Grounding, type Level, type RegistryEntry, type Source, type SourceType } from "./schema";

export const SEED_AUTHOR = "port:coastal-resilience-studio@cb732bd";
export const SEED_AT = "2026-11-04T00:00:00.000Z";
const GEO: Record<Level, string> = { global: "global", national: "IN", state: "IN-GA", city: "IN-GA-panjim", site: "IN-GA-panjim" };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Source type per citation id. Classification of the register's own entries; the full citation text is carried verbatim. */
const SOURCE_TYPE_BY_ID: Record<string, SourceType> = {
  esri_elevation: "official_dataset", esri_places: "official_dataset", crz2011: "government_doc", crz2019: "government_doc", czmp_goa: "government_doc",
  census2011_panaji: "government_doc", copernicus_glo30: "official_dataset", fema_coastal_structures_2024: "government_doc", fema_p946: "government_doc",
  fema_540_rule: "government_doc", goda2010: "peer_reviewed", huizinga2017: "un_giz_report", ipcc_ar6_wg1_slr: "un_giz_report", ipcc_ar6_wg2: "un_giz_report",
  ipcc_ar6_wg2_ccb_feasib: "un_giz_report", ipcc_ar6_wg2_ch3_smtable: "un_giz_report", iucn2020: "un_giz_report", invest_cv: "peer_reviewed",
  lwm_khazan: "expert_elicitation", mazda1997: "peer_reviewed", mazda2006: "peer_reviewed", mcivor2012_waves: "un_giz_report", mcivor2012_surge: "un_giz_report",
  moftakhari2017: "peer_reviewed", naro_paddy_dam: "peer_reviewed", njseagrant_dune: "government_doc", ramakrishnan2022: "peer_reviewed", sandrp_goa: "expert_elicitation",
  shetye2007: "peer_reviewed", singh2020: "peer_reviewed", sundar2005: "peer_reviewed", sendai2015: "un_giz_report", usace_cem: "government_doc",
  usace_em1110_2_1420: "government_doc", wahl2015: "peer_reviewed", dangremond1996: "peer_reviewed"
};

function classify(id: string, full: string): SourceType {
  if (SOURCE_TYPE_BY_ID[id]) return SOURCE_TYPE_BY_ID[id];
  const t = `${id} ${full}`.toLowerCase();
  if (/ipcc|unisdr|undrr|\biucn\b|\bgiz\b|united nations|world bank|nature conservancy|wetlands international|jrc technical/.test(t)) return "un_giz_report";
  if (/census|notification|ministry|government|department|port trust|ddmp|sdmp|\bfema\b|usace|\bimd\b|\bcwc\b|survey of india|ncscm|corporation|naval hydrographic|chart datum|town planning|municipal/.test(t)) return "government_doc";
  if (/openstreetmap|copernicus|ghs-pop|ghsl|deltadtm|dataset|4tu\.researchdata|psmsl|ibtracs|worldpop|codec|gadm|microsoft|esri|global ml building|sentinel|era5|gtsm|data portal|zenodo/.test(t)) return "official_dataset";
  if (/et al\.|journal|proceedings|doi:10\.|nature |scientific|elsevier|springer|wiley|\(\d{4}\)\.|coastal engineering|climatic change/.test(t)) return "peer_reviewed";
  if (/field|survey|tide-pole|observed|site visit|ground truth/.test(t)) return "field_survey";
  return "expert_elicitation";
}

function yearOf(full: string): number | null {
  const m = full.match(/\((\d{4})[a-z]?[,)]/) ?? full.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const y = Number(m[0].replace(/[^\d]/g, "").slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function urlOf(full: string): string | null {
  const m = full.match(/https?:\/\/[^\s)]+/) ?? full.match(/doi:\s*(10\.\S+)/i);
  if (!m) return null;
  return m[0].startsWith("http") ? m[0] : `https://doi.org/${m[1]}`;
}

function sourceFor(citationIds: string[], note: string | null, grounding: Grounding): Source {
  const cites = citationIds.map((id) => ({ id, c: CITATIONS[id] })).filter((x) => x.c);
  if (cites.length) {
    const text = cites.map((x) => x.c.full).join(" | ");
    return {
      citation: text,
      source_type: classify(cites[0].id, cites[0].c.full),
      source_year: yearOf(cites[0].c.full),
      source_url: urlOf(cites[0].c.full),
      locator: cites.map((x) => x.c.usedFor).filter(Boolean).join(" | ") || null,
      citation_ids: cites.map((x) => x.id)
    };
  }
  return {
    citation: `Placeholder set in the coastal-resilience-studio model audit, Oct 2026 (docs/MODEL_AUDIT_LOG_ported.md), grounding ${grounding}. ${note ?? "No note."}`,
    source_type: "expert_elicitation",
    source_year: 2026,
    source_url: null,
    locator: "docs/MODEL_AUDIT_LOG_ported.md",
    citation_ids: []
  };
}

/** Level per data path (spec section 3.3): most entries are global or national; Panjim-specific ones are city. */
function levelFor(path: string): Level {
  if (/^hazards\.(stormTideByRp|riverStageByRp|rainDepthByRp)\./.test(path)) return "city";
  if (/^hazards\.params\.(highTideReferenceM|springHighWaterM)$/.test(path)) return "state";
  if (/^hazards\.params\.(lambda\w+|bundCrestM|outfallInvertM|drainCapacityMmPerH|rainBurstHours)$/.test(path)) return "city";
  if (/^hazards\.seaLevelRise\.global/.test(path)) return "global";
  if (/^hazards\.seaLevelRise/.test(path)) return "state";
  if (/^damage\.(maxDamage|conversion)/.test(path)) return "national";
  if (/^(svi|areas|datasets)\./.test(path)) return "city";
  return "global";
}

function usedByFor(path: string): string[] {
  const sol = path.match(/^solutions\.([A-Za-z0-9_-]+)\./);
  if (sol) return [`solution:${sol[1]}`];
  if (/^damage\./.test(path)) return ["model:damage", "model:people"];
  if (/^svi\./.test(path) || /^datasets\.(popGrid|exposureGrid)/.test(path) || /^areas\.\w+\.population/.test(path)) return ["model:people", "model:damage"];
  if (/^ecology\./.test(path)) return ["model:ecology"];
  if (/^rubric\./.test(path)) return ["solutions:feasibility"];
  return ["model:water-level"];
}

function kindFor(path: string, key: string, shape: "scalar" | "curve" | "table" | "reference"): EntryKind {
  if (shape === "curve") return "curve";
  if (shape === "reference") return "dataset_ref";
  if (/\.effects\./.test(path)) return "relationship";
  if (/threshold|affecteddepth|breach|crest|minimum|maximum/i.test(key)) return "threshold";
  if (/index/i.test(key)) return "index";
  return "parameter";
}

const humanize = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").replace(/\bM\b/g, "(m)").trim();

export interface SeedReport {
  entries: RegistryEntry[];
  /** numeric leaves that look like parameters but sit under no grounded object: they need an entry before the chain can be signed off */
  uncovered: { path: string; value: number }[];
}

function row(id: string, kind: EntryKind, label: string, value: RegistryEntry["value"], unit: string, range: [number | null, number | null] | null, grounding: Grounding, citationIds: string[], note: string | null): RegistryEntry {
  const level = levelFor(id);
  return {
    id, version: 1, version_id: versionId(id, 1), kind, label, value, unit, valid_range: range,
    level, geography: GEO[level], source: sourceFor(citationIds, note, grounding), grounding, note,
    author: SEED_AUTHOR, reviewer: null, review_note: null, status: "in_review", created_at: SEED_AT, approved_at: null, supersedes: null,
    change_reason: null, used_by: usedByFor(id)
  };
}

const PARAM_KEY = /(M|Km2|Km|Ha|PerKm|Inr|Share|Factor|Hours|MmPerH|M3s|M3|M2|Mm|PerYear|Coef\w*|Pct|Percent|Rate|value|low|high|default|min|max)$/;
const STRUCTURAL = new Set(["bbox", "cols", "rows", "cellDeg", "cellAreaKm2", "cellEdgeKm", "lon", "lat", "lon_min", "lon_max", "lat_min", "lat_max", "step", "year", "psmslId", "pointId", "distanceFromMouthKm", "priceYear", "scale", "osmWays", "nodata", "cells", "rings", "cellsAtOrBelowSpringHighWater", "population2011", "illiteracy7plus", "children0to6", "casualWorkerShare", "index", "waterShare"]);

/** Walk the data files and extract every grounded object as an entry. */
export function buildSeed(): SeedReport {
  const entries: RegistryEntry[] = [];
  const uncovered: { path: string; value: number }[] = [];
  const seen = new Set<string>();
  const push = (e: RegistryEntry) => { if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); } };

  const visit = (node: unknown, path: string, key: string, grounded: boolean) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        const k = isObj(v) && typeof v.id === "string" ? String(v.id) : isObj(v) && typeof v.kind === "string" ? String(v.kind) : isObj(v) && typeof v.key === "string" ? String(v.key) : String(i);
        visit(v, `${path}.${k}`, k, grounded);
      });
      return;
    }
    if (!isObj(node)) {
      if (isNum(node) && !grounded && PARAM_KEY.test(key) && !STRUCTURAL.has(key) && !/^\d+$/.test(key)) uncovered.push({ path, value: node });
      return;
    }
    const g = node.grounding ?? node.grounding_quality;
    const hasGrounding = typeof g === "string" && (GROUNDINGS as readonly string[]).includes(g);
    let isEntry = false;
    if (isNum(node.gumbelLocationM) && isNum(node.gumbelScaleM)) {
      // the storm-tide return-period curve is a Gumbel fit at one CoDEC point; the fit itself is a relationship in the registry
      const note = `${String(node.dataset)}; point ${String(node.pointId)} at ${String(node.lon)} E ${String(node.lat)} N, ${String(node.distanceFromMouthKm)} km from the Mandovi mouth; doi:${String(node.doi)}; accessed ${String(node.accessed)}`;
      push(row(path, "relationship", "Storm tide vs return period: Gumbel fit at the CoDEC point", { type: "table", columns: ["gumbel_location_m", "gumbel_scale_m"], rows: [[node.gumbelLocationM, node.gumbelScaleM]] }, "m above MSL", null, "reasoned_extrapolation", ["muis2020_codec"], note));
      return;
    }
    if (node.existing === true && isObj(node.params) && typeof node.derivedNote === "string") {
      // existing measures listed in the case-study file (Mala pumps, lake, gates): their sizes are derived placeholders, documented in derivedNote
      for (const [pk, pv] of Object.entries(node.params as Json)) {
        if (!isNum(pv) || pk === "catchment") continue;
        const grounding: Grounding = /placeholder/i.test(node.derivedNote) ? "placeholder_needs_calibration" : "reasoned_extrapolation";
        const r = row(`${path}.params.${pk}`, "parameter", `${String(node.id)}: ${humanize(pk)}`, { type: "scalar", value: pv }, pk.endsWith("M3s") ? "m3/s" : pk.endsWith("M3") ? "m3" : "", null, grounding, [], node.derivedNote);
        r.source = { citation: `Derived from press and open data as described: ${node.derivedNote}`, source_type: "expert_elicitation", source_year: 2023, source_url: null, locator: "caseStudyAreas.json rain.existingMeasures", citation_ids: [] };
        push(r);
      }
      return;
    }
    if (hasGrounding) {
      const grounding = g as Grounding;
      const cites = Array.isArray(node.citations) ? (node.citations as string[]) : [];
      const note = typeof node.note === "string" ? node.note : typeof node.grounding_note === "string" ? node.grounding_note : null;
      const label = typeof node.label === "string" ? node.label : humanize(key);
      const unit = typeof node.unit === "string" ? node.unit : "";
      if (isNum(node.value)) {
        const lo = isNum(node.low) ? node.low : undefined, hi = isNum(node.high) ? node.high : undefined;
        push(row(path, kindFor(path, key, "scalar"), label, { type: "scalar", value: node.value, low: lo, high: hi }, unit, lo !== undefined && hi !== undefined ? [lo, hi] : null, grounding, cites, note));
        isEntry = true;
      } else if (isNum(node.default)) {
        const lo = isNum(node.min) ? node.min : undefined, hi = isNum(node.max) ? node.max : undefined;
        push(row(path, kindFor(path, key, "scalar"), `${label} (per placement, default)`, { type: "scalar", value: node.default, low: lo, high: hi }, unit, lo !== undefined && hi !== undefined ? [lo, hi] : null, grounding, cites, note));
        isEntry = true;
      } else if (Array.isArray(node.depthM) && Array.isArray(node.factor)) {
        const rows = (node.depthM as number[]).map((d, i) => [d, (node.factor as number[])[i]]);
        push(row(path, "curve", label, { type: "table", columns: ["depth_m", "damage_factor"], rows }, "fraction of maximum damage", null, grounding, cites, note));
        isEntry = true;
      } else if (isObj(node.horizons)) {
        const rows: (number | string | null)[][] = [];
        for (const [h, byS] of Object.entries(node.horizons as Record<string, Record<string, number[]>>)) for (const [ssp, v] of Object.entries(byS)) rows.push([h, ssp, v[0], v[1], v[2]]);
        push(row(path, "parameter", label, { type: "table", columns: ["horizon", "ssp", "central_m", "low_m", "high_m"], rows }, "m", null, grounding, cites, note));
        isEntry = true;
      } else if (Array.isArray(node.units)) {
        const rows = (node.units as Json[]).map((u) => [String(u.code2001), String(u.name), Number(u.population2011), Number(u.index), String(u.class)]);
        push(row(path, "index", label, { type: "table", columns: ["census_code_2001", "unit", "population_2011", "svi_index", "svi_class"], rows }, "index", null, grounding, cites, note));
        isEntry = true;
      } else if (isNum(node.total)) {
        push(row(path, "parameter", `${label} total`, { type: "scalar", value: node.total }, "people", null, grounding, cites, note));
        isEntry = true;
      } else {
        push(row(path, "dataset_ref", label, { type: "reference", uri: `${path.split(".")[0]}.json#${path}` }, "", null, grounding, cites, note));
        isEntry = true;
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (["citations", "grounding", "grounding_quality", "note", "grounding_note", "label", "unit", "value", "low", "high", "default", "min", "max", "moreProtective", "moreHazardous"].includes(k)) continue;
      visit(v, `${path}.${k}`, k, grounded || isEntry);
    }
  };

  const files: Record<string, unknown> = { ...RAW_DATA };
  // a file whose root holds a collection under its own name (solutions.solutions, areas.areas) is flattened so ids read as paths
  for (const [name, data] of Object.entries(files)) {
    if (isObj(data) && name in data) {
      visit(data[name], name, name, false);
      for (const [k, v] of Object.entries(data)) if (k !== name) visit(v, `${name}.${k}`, k, false);
    } else visit(data, name, name, false);
  }
  // the gridded datasets
  for (const [k, d] of Object.entries(DATASETS)) {
    const dd = d as { source?: unknown; grounding?: string | null; note?: string; label?: string; citations?: string[] };
    const grounding = (dd.grounding && (GROUNDINGS as readonly string[]).includes(dd.grounding) ? dd.grounding : "reasoned_extrapolation") as Grounding;
    const srcText = dd.source ? JSON.stringify(dd.source) : (dd.label ?? k);
    const id = `datasets.${k}`;
    const r = row(id, "dataset_ref", dd.label ?? humanize(k), { type: "reference", uri: `packages/core/src/data#${k}` }, "", null, grounding, dd.citations ?? [], dd.note ?? null);
    if (!r.source.citation_ids.length) r.source = { citation: srcText, source_type: classify(k, srcText), source_year: yearOf(srcText), source_url: urlOf(srcText), locator: null, citation_ids: [] };
    push(r);
  }
  return { entries, uncovered };
}
