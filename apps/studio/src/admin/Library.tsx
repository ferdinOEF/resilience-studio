/** Scenario library: coverage of hazard × return period × horizon × pathway × solution set by the runs that exist (spec section 1.4). */
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { Link } from "../router";
import { setLibraryCounts } from "./counts";
import { fmtRps, HAZARD_LABEL, HORIZON_LABEL, PATHWAY_LABEL, SignedOffChip } from "./numbers";
import { runHref } from "./RunsList";
import type { LibraryCell, LibraryResponse } from "./types";

type Filter = "all" | LibraryCell["status"];

export function LibraryStatusChip({ status }: { status: LibraryCell["status"] }) {
  const cls = status === "pre-run" ? "chip-status-approved" : status === "stale" ? "chip-stale" : "chip-status-draft";
  return <span className={`chip ${cls}`}>{status}</span>;
}

export function Library() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    api<LibraryResponse>("/api/runs/library")
      .then((l) => {
        if (!alive) return;
        setData(l);
        setLibraryCounts(l);
        setError(null);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  const d = data?.dimensions;
  const c = data?.counts;
  const pct = c && c.total ? Math.round((c.pre_run / c.total) * 100) : 0;
  const cells = data?.cells.filter((x) => filter === "all" || x.status === filter) ?? [];

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <div className="adm-section-label">Scenario library</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            Scenario library · {data?.place ?? "Panjim"}
          </h1>
          {d ? (
            <div className="muted small">
              {d.hazards.length} hazards × {d.horizons.length} horizons × {d.pathways.length} pathways × {d.solution_sets.length} solution set{d.solution_sets.length === 1 ? "" : "s"} · each cell holds {d.return_periods.length} return periods ({fmtRps(d.return_periods)}) · today's horizon runs on one pathway
            </div>
          ) : (
            <div className="muted small">hazard × return period × horizon × pathway × solution set</div>
          )}
        </div>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="tiles">
        <div className="tile">
          <div className="adm-section-label">Pre-run</div>
          <div className="tile-num">{c ? c.pre_run : "—"}</div>
          <div className="small muted">of {c ? c.total : "—"} cells · the studio explores these once the chain is signed off</div>
        </div>
        <div className="tile">
          <div className="adm-section-label">Stale</div>
          <div className={`tile-num${c?.stale ? " hint-warn" : ""}`}>{c ? c.stale : "—"}</div>
          <div className="small muted">a registry value used was superseded; hidden until re-run</div>
        </div>
        <div className="tile">
          <div className="adm-section-label">Missing</div>
          <div className="tile-num">{c ? c.missing : "—"}</div>
          <div className="small muted">not run yet</div>
        </div>
        <div className="tile">
          <div className="adm-section-label">Coverage</div>
          <div className="tile-num">{c ? `${pct}%` : "—"}</div>
          <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Scenario library coverage">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="adm-toolbar">
        <div className="chip-row" role="group" aria-label="Status filter">
          {(["all", "pre-run", "stale", "missing"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`chip-filter${filter === f ? " is-active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {data ? `${cells.length} of ${data.cells.length} cells` : ""}
        </span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Hazard</th>
            <th>Horizon</th>
            <th>Pathway</th>
            <th>Solution set</th>
            <th>Status</th>
            <th>Run</th>
            <th>Gate</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((x) => (
            <tr key={x.key}>
              <td>{HAZARD_LABEL[x.hazard] ?? x.hazard}</td>
              <td>{HORIZON_LABEL[x.horizon] ?? x.horizon}</td>
              <td>{PATHWAY_LABEL[x.pathway] ?? x.pathway}</td>
              <td>{x.solution_set}</td>
              <td>
                <LibraryStatusChip status={x.status} />
              </td>
              <td>
                {x.run_id ? (
                  <Link href={runHref(x.run_id)} className="mono">
                    {x.run_id}
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>{x.run_id ? <SignedOffChip signedOff={x.chain_signed_off} short /> : <span className="muted small">—</span>}</td>
            </tr>
          ))}
          {data && cells.length === 0 ? (
            <tr>
              <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No cells with this status.
              </td>
            </tr>
          ) : null}
          {!data && !error ? (
            <tr>
              <td colSpan={7} className="muted" style={{ padding: 16 }}>
                Loading…
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
