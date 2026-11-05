/** Runs: every run on record, newest first, and the "New run" panel (scientist / admin) that asks the Meta Mind for a chain. */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, canPropose, errorMessage } from "../api";
import { Link, navigate } from "../router";
import { useSession } from "../session";
import { fmtDate } from "./format";
import { refreshCounts, setRunsCount } from "./counts";
import { fmtDuration, fmtRps, HAZARD_LABEL, HORIZON_LABEL, PATHWAY_LABEL, RunStatusChip, SignedOffChip, StaleChip } from "./numbers";
import { HAZARDS, HORIZONS, PATHWAYS, RETURN_PERIODS, type Hazard, type Horizon, type Outlay, type Pathway, type ReturnPeriod, type RunSummary } from "./types";

const CODE_HINT: Record<string, string> = {
  read_only: "Runs need a database: none is connected to this deployment.",
  invalid: "The scenario did not pass the schema.",
  forbidden: "Your role cannot request runs.",
  unauthenticated: "Sign in again."
};

export function runHref(id: string): string {
  return `/admin/runs/${encodeURIComponent(id)}`;
}

export function RunsList() {
  const { user } = useSession();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ runs: RunSummary[] }>("/api/runs?place=panjim");
      const sorted = [...r.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRuns(sorted);
      setRunsCount(sorted.length);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <div className="adm-section-label">Runs</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            Runs · Panjim
          </h1>
          <div className="muted small">Every run is a chain of steps with its hand-offs, agent log and audit export.</div>
        </div>
        {canPropose(user) ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((s) => !s)} aria-expanded={showNew}>
            {showNew ? "Close" : "New run"}
          </button>
        ) : null}
      </div>

      {showNew && canPropose(user) ? <NewRunPanel onDone={() => setShowNew(false)} /> : null}

      {error ? <div className="notice notice-error">{error}</div> : null}

      <table className="table runs-table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Run</th>
            <th>Created</th>
            <th>Scenario</th>
            <th>Solution set</th>
            <th>Status</th>
            <th className="num">Steps</th>
            <th className="num">Hand-offs failed</th>
            <th>Gate</th>
            <th className="num">Duration</th>
          </tr>
        </thead>
        <tbody>
          {runs?.map((r) => (
            <tr key={r.id} className="is-link" onClick={() => navigate(runHref(r.id))}>
              <td>
                <Link href={runHref(r.id)} className="row-title mono" onClick={(ev) => ev.stopPropagation()}>
                  {r.id}
                </Link>
                <div className="small muted">{r.requested_by}</div>
              </td>
              <td className="small">{fmtDate(r.created_at)}</td>
              <td>
                <div>
                  {HAZARD_LABEL[r.plan.scenario.hazard] ?? r.plan.scenario.hazard} · {fmtRps(r.plan.scenario.return_periods)}
                </div>
                <div className="small muted">
                  {HORIZON_LABEL[r.plan.scenario.horizon] ?? r.plan.scenario.horizon} · {PATHWAY_LABEL[r.plan.scenario.pathway] ?? r.plan.scenario.pathway}
                  {r.plan.scenario.bunds_failed ? " · bunds failed" : ""}
                </div>
              </td>
              <td>{r.plan.scenario.solution_set.label}</td>
              <td>
                <div className="chip-row">
                  <RunStatusChip status={r.status} />
                  <StaleChip stale={r.stale} />
                </div>
              </td>
              <td className="num">{r.steps}</td>
              <td className={`num${r.handoffs.failed ? " hint-warn" : ""}`}>
                {r.handoffs.failed}
                <span className="muted small"> / {r.handoffs.total}</span>
              </td>
              <td>
                <SignedOffChip signedOff={r.chain_signed_off} short />
              </td>
              <td className="num">{fmtDuration(r.duration_ms)}</td>
            </tr>
          ))}
          {runs && runs.length === 0 ? (
            <tr>
              <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No runs yet{canPropose(user) ? ": start one with New run" : ""}.
              </td>
            </tr>
          ) : null}
          {runs === null && !error ? (
            <tr>
              <td colSpan={9} className="muted" style={{ padding: 16 }}>
                Loading…
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- new run */

const SOLUTION_SET = { id: "do-nothing", label: "do nothing (today's measures)", placements: [] as unknown[] };

function NewRunPanel({ onDone }: { onDone: () => void }) {
  const [hazard, setHazard] = useState<Hazard>("compound");
  const [rps, setRps] = useState<ReturnPeriod[]>([...RETURN_PERIODS]);
  const [horizon, setHorizon] = useState<Horizon>("today");
  const [pathway, setPathway] = useState<Pathway>("ssp245");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const toggleRp = (rp: ReturnPeriod) => setRps((cur) => (cur.includes(rp) ? cur.filter((x) => x !== rp) : [...RETURN_PERIODS].filter((x) => x === rp || cur.includes(x))));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rps.length) {
      setError({ message: "Pick at least one return period." });
      return;
    }
    setBusy(true);
    setError(null);
    const scenario = { place: "panjim", hazard, return_periods: rps, horizon, pathway, solution_set: SOLUTION_SET };
    const q = question.trim() || `${HAZARD_LABEL[hazard]} at RP ${rps.join("/")}, ${horizon} ${PATHWAY_LABEL[pathway]}, ${SOLUTION_SET.label}`;
    try {
      const r = await api<{ run: RunSummary; outlay: Outlay }>("/api/runs", { method: "POST", json: { question: q, scenario } });
      void refreshCounts();
      onDone();
      navigate(runHref(r.run.id));
    } catch (err) {
      // a failed run still comes back as a record (status 500 with {run, outlay}): open it so the log can be read
      const data = err instanceof ApiError ? (err.data as { run?: RunSummary } | undefined) : undefined;
      if (data?.run?.id) {
        void refreshCounts();
        onDone();
        navigate(runHref(data.run.id));
        return;
      }
      setError({ message: errorMessage(err), code: err instanceof ApiError ? err.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card new-run" onSubmit={submit} aria-label="New run">
      <div className="adm-section-label">New run · the Meta Mind plans the chain, the Liaison executes it</div>
      <div className="new-run-grid">
        <div className="field">
          <label htmlFor="nr-hazard">Hazard</label>
          <select id="nr-hazard" className="select" value={hazard} onChange={(e) => setHazard(e.target.value as Hazard)}>
            {HAZARDS.map((h) => (
              <option key={h} value={h}>
                {HAZARD_LABEL[h]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">Return periods</span>
          <div className="check-row" role="group" aria-label="Return periods">
            {RETURN_PERIODS.map((rp) => (
              <label key={rp} className="check">
                <input type="checkbox" checked={rps.includes(rp)} onChange={() => toggleRp(rp)} /> 1:{rp}
              </label>
            ))}
          </div>
          <span className="small muted">{rps.length >= 2 ? "two or more: the loss model integrates the annual expectation" : "one only: no annual integration"}</span>
        </div>
        <div className="field">
          <label htmlFor="nr-horizon">Horizon</label>
          <select id="nr-horizon" className="select" value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
            {HORIZONS.map((h) => (
              <option key={h} value={h}>
                {HORIZON_LABEL[h]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nr-pathway">Pathway</label>
          <select id="nr-pathway" className="select" value={pathway} onChange={(e) => setPathway(e.target.value as Pathway)}>
            {PATHWAYS.map((p) => (
              <option key={p} value={p}>
                {PATHWAY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nr-solution">Solution set</label>
          <div id="nr-solution" className="input is-static" title="Phase 1: the baseline only; placements come with the Solutions view">
            {SOLUTION_SET.label}
          </div>
        </div>
        <div className="field span2">
          <label htmlFor="nr-question">Question</label>
          <textarea id="nr-question" className="textarea" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What the run should answer, in a sentence. Left empty, the scenario describes itself." />
        </div>
      </div>
      {error ? (
        <div className="notice notice-error">
          {error.message}
          {error.code ? (
            <span className="muted">
              {" "}
              · <span className="mono">{error.code}</span>
              {CODE_HINT[error.code] ? ` — ${CODE_HINT[error.code]}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !rps.length}>
          {busy ? "Running the chain…" : "Run the chain"}
        </button>
        <button type="button" className="btn" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <span className="small muted">Phase 1 runs the ported chain in-process: water level → damage → people → loss, three bounds per return period.</span>
      </div>
    </form>
  );
}
