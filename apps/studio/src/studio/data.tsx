/**
 * What every studio view shares: the gate (GET /api/runs/studio/panjim), the place manifests, the scenario choice,
 * the solution set built in Solutions, the A/B pair from Scenarios, and the admin preview switch.
 *
 * Rule 2 of the spec: the plain studio shows numbers only from the gate's signed-off runs. In admin preview (a
 * signed-in user flips it in the header) the views also read the latest ok run per hazard from the run log and the
 * placeholder zones; every such number carries an "unsigned" chip.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage, type User } from "../api";
import type { Hazard, Outlay, RunRecord, RunSummary } from "../admin/types";
import { HAZARDS } from "../admin/types";
import { useSession } from "../session";
import { DO_NOTHING, type ExtentResponse, type Gate, type PlaceResponse, type PlaceSummary, type ScenarioChoice, type SolutionSet, type ZonesResponse } from "./types";

/* ------------------------------------------------------------------ fetch helpers */

const cache = new Map<string, Promise<unknown>>();

/** GET with a per-session cache for things that do not change while the page is open (geometry, manifests). */
export function cachedGet<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = api<T>(path).catch((e) => {
      cache.delete(path);
      throw e;
    });
    cache.set(path, p);
  }
  return p;
}

export interface Fetched<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Fetch a path (null = nothing to fetch). cached=true goes through the session cache. */
export function useFetch<T>(path: string | null, cached = true): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (cached ? cachedGet<T>(path) : api<T>(path))
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: errorMessage(e), loading: false }));
    return () => {
      live = false;
    };
  }, [path, cached]);
  return state;
}

/* ------------------------------------------------------------------ the shared state */

export interface RunPair {
  a: RunSummary | null;
  b: RunSummary | null;
  outlayB: Outlay | null;
}

export interface StudioState {
  user: User | null;
  /** the gate as the API answered it (null while loading or when the API is unreachable) */
  gate: Gate | null;
  gateError: string | null;
  gateLoading: boolean;
  refreshGate: () => void;
  places: PlaceSummary[];
  india: PlaceResponse | null;
  panjim: PlaceResponse | null;
  /** admin preview: requested by the user and only effective while signed in */
  previewOn: boolean;
  previewWanted: boolean;
  setPreview: (on: boolean) => void;
  /** the runs the views may show: the gate's signed-off runs, plus in preview the latest ok run per hazard */
  runs: Partial<Record<Hazard, RunSummary>>;
  /** every run of the place (preview only), newest first */
  allRuns: RunSummary[];
  refreshRuns: () => void;
  modelled: boolean;
  /** why the place is not modelled (the gate's reason, or the API error) */
  reason: string;
  hazard: Hazard;
  setHazard: (h: Hazard) => void;
  /** the run shown for the current hazard */
  run: RunSummary | null;
  scenario: ScenarioChoice;
  setScenario: (s: ScenarioChoice) => void;
  solutionSet: SolutionSet;
  setSolutionSet: (s: SolutionSet) => void;
  pair: RunPair;
  setPair: (p: RunPair) => void;
  selectedZone: string | null;
  setSelectedZone: (id: string | null) => void;
}

const StudioContext = createContext<StudioState | null>(null);

const PREVIEW_KEY = "studio.adminPreview";

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota */
  }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [gate, setGate] = useState<Gate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [gateTick, setGateTick] = useState(0);
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [india, setIndia] = useState<PlaceResponse | null>(null);
  const [panjim, setPanjim] = useState<PlaceResponse | null>(null);
  const [previewWanted, setPreviewWanted] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(PREVIEW_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [allRuns, setAllRuns] = useState<RunSummary[]>([]);
  const [runsTick, setRunsTick] = useState(0);
  const [hazard, setHazard] = useState<Hazard>("surge");
  // the scenario choice, the solution set and the A/B pair survive a reload within the tab
  const [scenario, setScenarioState] = useState<ScenarioChoice>(() => stored("studio.scenario", { hazard: "surge", rp: 50, year: 2040, pathway: "ssp245" }));
  const [solutionSet, setSolutionSetState] = useState<SolutionSet>(() => stored("studio.solutionSet", DO_NOTHING));
  const [pair, setPairState] = useState<RunPair>(() => stored("studio.pair", { a: null, b: null, outlayB: null }));
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const setScenario = useCallback((s: ScenarioChoice) => {
    setScenarioState(s);
    store("studio.scenario", s);
  }, []);
  const setSolutionSet = useCallback((s: SolutionSet) => {
    setSolutionSetState(s);
    store("studio.solutionSet", s);
  }, []);
  const setPair = useCallback((p: RunPair) => {
    setPairState(p);
    store("studio.pair", p);
  }, []);

  const previewOn = previewWanted && !!user;

  useEffect(() => {
    let live = true;
    setGateLoading(true);
    api<Gate>("/api/runs/studio/panjim")
      .then((g) => {
        if (!live) return;
        setGate(g);
        setGateError(null);
      })
      .catch((e) => {
        if (!live) return;
        setGate(null);
        setGateError(errorMessage(e));
      })
      .finally(() => live && setGateLoading(false));
    return () => {
      live = false;
    };
  }, [gateTick]);

  useEffect(() => {
    cachedGet<{ places: PlaceSummary[] }>("/api/places").then((r) => setPlaces(r.places)).catch(() => setPlaces([]));
    cachedGet<PlaceResponse>("/api/places/india").then(setIndia).catch(() => setIndia(null));
    cachedGet<PlaceResponse>("/api/places/panjim").then(setPanjim).catch(() => setPanjim(null));
  }, []);

  useEffect(() => {
    if (!previewOn) {
      setAllRuns([]);
      return;
    }
    let live = true;
    api<{ runs: RunSummary[] }>("/api/runs?place=panjim&limit=200")
      .then((r) => live && setAllRuns([...r.runs].sort((a, b) => b.created_at.localeCompare(a.created_at))))
      .catch(() => live && setAllRuns([]));
    return () => {
      live = false;
    };
  }, [previewOn, runsTick]);

  const setPreview = useCallback((on: boolean) => {
    setPreviewWanted(on);
    try {
      window.sessionStorage.setItem(PREVIEW_KEY, on ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, []);

  const runs = useMemo(() => {
    const out: Partial<Record<Hazard, RunSummary>> = {};
    if (previewOn) {
      for (const r of allRuns) {
        const h = r.plan.scenario.hazard;
        if (r.status === "ok" && r.result && r.plan.scenario.solution_set.id === "do-nothing" && !out[h]) out[h] = r;
      }
    }
    // the gate's signed-off runs win over anything unsigned
    for (const h of HAZARDS) if (gate?.runs?.[h]) out[h] = gate.runs[h];
    return out;
  }, [gate, previewOn, allRuns]);

  const modelled = Object.keys(runs).length > 0;
  const reason = gateError ? `the API is unreachable (${gateError})` : (gate?.reason ?? (gateLoading ? "checking the model chain…" : "no signed-off run yet"));
  const firstHazard = HAZARDS.find((h) => runs[h]);
  const run = runs[hazard] ?? (firstHazard ? (runs[firstHazard] ?? null) : null);

  const value = useMemo<StudioState>(
    () => ({
      user,
      gate,
      gateError,
      gateLoading,
      refreshGate: () => setGateTick((t) => t + 1),
      places,
      india,
      panjim,
      previewOn,
      previewWanted,
      setPreview,
      runs,
      allRuns,
      refreshRuns: () => setRunsTick((t) => t + 1),
      modelled,
      reason,
      hazard,
      setHazard,
      run,
      scenario,
      setScenario,
      solutionSet,
      setSolutionSet,
      pair,
      setPair,
      selectedZone,
      setSelectedZone
    }),
    [user, gate, gateError, gateLoading, places, india, panjim, previewOn, previewWanted, setPreview, runs, allRuns, modelled, reason, hazard, run, scenario, solutionSet, pair, selectedZone]
  );
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioState {
  const s = useContext(StudioContext);
  if (!s) throw new Error("useStudio() needs a <StudioProvider>");
  return s;
}

/** A run is unsigned when its chain is not signed off or it is stale: shown only in admin preview, always chipped. */
export function isUnsigned(run: RunSummary | RunRecord | null | undefined): boolean {
  return !!run && (!run.chain_signed_off || run.stale);
}

/** The run's flood extent (headline event, central bound). studio=1 whenever the run is signed off: the API refuses anything else. */
export function useExtent(run: RunSummary | null, previewOn: boolean): Fetched<ExtentResponse> {
  const path = run && run.status === "ok" ? (isUnsigned(run) ? (previewOn ? `/api/runs/${run.id}/extent` : null) : `/api/runs/${run.id}/extent?studio=1`) : null;
  return useFetch<ExtentResponse>(path);
}

/** Per-zone aggregates over the placeholder ward zones: admin preview only (the zones are admin-only until the CCP shapefile). */
export function useZones(run: RunSummary | null, previewOn: boolean): Fetched<ZonesResponse> {
  const path = previewOn && run && run.status === "ok" ? `/api/runs/${run.id}/zones?admin=1&layer=ward_zones${isUnsigned(run) ? "" : "&studio=1"}` : null;
  return useFetch<ZonesResponse>(path);
}

/** A run with the Meta Mind's reading (text and references; never numbers of its own). */
export function useRunDetail(id: string | null): Fetched<{ run: RunRecord; outlay: Outlay }> {
  return useFetch<{ run: RunRecord; outlay: Outlay }>(id ? `/api/runs/${id}?cells=0` : null);
}

/** Headline return period and horizon of a run, for legends and chips. */
export function runEventLabel(run: RunSummary | null): string {
  if (!run) return "";
  const rps = run.plan.scenario.return_periods;
  const rp = run.result?.headline_return_period ?? rps[rps.length - 1];
  return `1-in-${rp} · ${run.plan.scenario.horizon}`;
}
