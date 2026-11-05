/**
 * The 280 px right rail of the Runs pages (Admin mockup): Status (Meta Mind, Liaison agent, Model agents, Queue),
 * Scenario library progress, the pending Sign-off queue, and the framework note.
 */
import { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "../router";
import { setLibraryCounts, setModelsCounts, setSignOffPending, useCounts } from "./counts";
import { KIND_LABEL } from "./SignOffQueue";
import type { LibraryResponse, ModelsList, SignOffItem, SignOffList } from "./types";

export function RightRail() {
  const counts = useCounts();
  const [pending, setPending] = useState<SignOffItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    api<ModelsList>("/api/models").then((m) => alive && setModelsCounts(m)).catch(() => undefined);
    api<LibraryResponse>("/api/runs/library").then((l) => alive && setLibraryCounts(l)).catch(() => undefined);
    api<SignOffList>("/api/signoff?status=pending")
      .then((r) => {
        if (!alive) return;
        setPending(r.items);
        setSignOffPending(r.counts.pending);
      })
      .catch(() => alive && setPending([]));
    return () => {
      alive = false;
    };
  }, []);

  const lib = counts.library;
  const pct = lib && lib.total ? Math.round((lib.pre_run / lib.total) * 100) : 0;

  return (
    <>
      <section className="rail-section">
        <div className="adm-section-label">Status</div>
        <dl className="rail-status">
          <dt>Meta Mind</dt>
          <dd>
            <span className="dot dot-idle" /> idle · stub, plans and reads
          </dd>
          <dt>Liaison agent</dt>
          <dd>
            <span className="dot dot-idle" /> idle · deterministic
          </dd>
          <dt>Model agents</dt>
          <dd>
            <span className={`dot ${counts.models !== null && counts.models_healthy === counts.models ? "dot-ok" : "dot-warn"}`} />{" "}
            {counts.models === null ? "—" : `${counts.models_healthy ?? 0} of ${counts.models} healthy`}
          </dd>
          <dt>Queue</dt>
          <dd>
            <span className={`dot ${counts.signoff_pending ? "dot-warn" : "dot-idle"}`} /> {counts.signoff_pending === null ? "—" : `${counts.signoff_pending} pending`}
          </dd>
        </dl>
      </section>

      <section className="rail-section">
        <div className="adm-section-label">Scenario library · Panjim</div>
        <div className="rail-big">
          {lib ? (
            <>
              pre-run <strong>{lib.pre_run}</strong> of {lib.total}
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Scenario library coverage">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          hazard × return period × horizon × pathway × solution set
          {lib ? ` · ${lib.stale} stale · ${lib.missing} missing` : ""}
        </div>
        <Link href="/admin/library" className="small" style={{ display: "inline-block", marginTop: 6 }}>
          Open the library →
        </Link>
      </section>

      <section className="rail-section">
        <div className="adm-section-label">Sign-off queue</div>
        {pending === null ? (
          <div className="muted small" style={{ marginTop: 6 }}>
            Loading…
          </div>
        ) : pending.length === 0 ? (
          <div className="muted small" style={{ marginTop: 6 }}>
            Nothing awaits a human.
          </div>
        ) : (
          <ul className="rail-list">
            {pending.slice(0, 6).map((i) => (
              <li key={i.id}>
                <Link href="/admin/sign-off" className="rail-item">
                  <span className="rail-item-title">{i.title}</span>
                  <span className="chip chip-kind">{KIND_LABEL[i.kind] ?? i.kind}</span>
                </Link>
              </li>
            ))}
            {pending.length > 6 ? (
              <li className="small muted" style={{ paddingTop: 4 }}>
                and {pending.length - 6} more
              </li>
            ) : null}
          </ul>
        )}
        <Link href="/admin/sign-off" className="small" style={{ display: "inline-block", marginTop: 6 }}>
          Open the queue →
        </Link>
      </section>

      <div className="rail-note">Parameter changes go through the Meta Mind only, under the framework rules. Every change becomes a scenario variant and is logged here.</div>
    </>
  );
}
