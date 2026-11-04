/**
 * Entry page: the viewed version's full record, the version history, a two-version diff, and the workflow actions
 * (propose new version, submit for review, approve, reject) by role. API errors ({error, code}) are shown inline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, canPropose, canReview, errorMessage, type DiffChange, type RegistryEntry } from "../api";
import { Link } from "../router";
import { useSession } from "../session";
import { refreshCounts } from "./counts";
import { EntryForm } from "./EntryForm";
import { Evidence, fmtAny, fmtDate, fmtRange, fmtValue, GROUNDING_LABEL, SOURCE_TYPE_LABEL, StatusChip } from "./format";

const CODE_HINT: Record<string, string> = {
  two_person: "Two-person rule: the reviewer must differ from the author.",
  no_source: "No source, no save: a citation and a source type are required.",
  read_only: "The registry is read-only: no database is connected.",
  bad_state: "The version is not in a state that allows this action.",
  forbidden: "Your role cannot do this.",
  unauthenticated: "Sign in again."
};

/** The version the page opens on: approved, else the latest in review, else the latest draft, else the latest. */
function pickCurrent(vs: RegistryEntry[]): RegistryEntry | null {
  if (!vs.length) return null;
  const byVersionDesc = [...vs].sort((a, b) => b.version - a.version);
  return byVersionDesc.find((v) => v.status === "approved") ?? byVersionDesc.find((v) => v.status === "in_review") ?? byVersionDesc.find((v) => v.status === "draft") ?? byVersionDesc[0];
}

export function EntryDetail({ id }: { id: string }) {
  const { user } = useSession();
  const [versions, setVersions] = useState<RegistryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; code?: string } | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [diffA, setDiffA] = useState("");
  const [diffB, setDiffB] = useState("");
  const [diff, setDiff] = useState<DiffChange[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ id: string; versions: RegistryEntry[] }>(`/api/registry/${encodeURIComponent(id)}/versions`);
      setVersions([...r.versions].sort((a, b) => a.version - b.version));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      setVersions([]);
    }
  }, [id]);

  useEffect(() => {
    setVersions(null);
    setSelected(null);
    setProposing(false);
    setActionError(null);
    setActionOk(null);
    void load();
  }, [load]);

  const current = useMemo(() => (versions ? pickCurrent(versions) : null), [versions]);
  const viewed = useMemo(() => (versions && selected ? (versions.find((v) => v.version_id === selected) ?? current) : current), [versions, selected, current]);

  // default diff: previous version -> viewed
  useEffect(() => {
    if (!versions || !viewed || versions.length < 2) return;
    const prev = [...versions].reverse().find((v) => v.version < viewed.version) ?? versions.find((v) => v.version_id !== viewed.version_id);
    setDiffA(prev?.version_id ?? "");
    setDiffB(viewed.version_id);
  }, [versions, viewed]);

  useEffect(() => {
    if (!diffA || !diffB) {
      setDiff(null);
      return;
    }
    let alive = true;
    api<{ changes: DiffChange[] }>(`/api/registry/diff?a=${encodeURIComponent(diffA)}&b=${encodeURIComponent(diffB)}`)
      .then((r) => alive && (setDiff(r.changes), setDiffError(null)))
      .catch((e) => alive && (setDiff(null), setDiffError(errorMessage(e))));
    return () => {
      alive = false;
    };
  }, [diffA, diffB]);

  const act = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    setActionError(null);
    setActionOk(null);
    try {
      const r = await api<{ entry: RegistryEntry }>(path, { method: "POST", json: body ?? {} });
      await load();
      setSelected(r.entry.version_id);
      setNote("");
      setActionOk(`${label}: ${r.entry.version_id} is now ${r.entry.status.replace("_", " ")}.`);
      void refreshCounts();
    } catch (e) {
      setActionError({ message: errorMessage(e), code: (e as { code?: string }).code });
    } finally {
      setBusy(null);
    }
  };

  if (versions === null) return <div className="muted">Loading {id}…</div>;
  if (loadError || !viewed) {
    return (
      <div>
        <Link href="/admin/registry">← Registry</Link>
        <h1 className="adm-title" style={{ marginTop: 12 }}>
          {id}
        </h1>
        <div className="notice notice-error" style={{ marginTop: 12 }}>
          {loadError ?? "No versions found."}
        </div>
      </div>
    );
  }

  if (proposing) {
    return (
      <div>
        <Link href="/admin/registry">← Registry</Link>
        <div className="adm-section-label" style={{ marginTop: 12 }}>
          New version of
        </div>
        <h1 className="adm-title" style={{ marginTop: 4 }}>
          {viewed.label} <span className="mono muted" style={{ fontWeight: 400 }}>{viewed.id}</span>
        </h1>
        <p className="muted small">Prefilled from v{viewed.version}. The id is locked; a change reason is required.</p>
        <EntryForm
          mode="version"
          base={viewed}
          onCancel={() => setProposing(false)}
          onDone={(e) => {
            setProposing(false);
            setSelected(e.version_id);
            setActionOk(`Draft v${e.version} created. Submit it for review when it is ready.`);
            void load();
            void refreshCounts();
          }}
        />
      </div>
    );
  }

  const v = viewed;
  const vid = encodeURIComponent(v.version_id);
  const mayPropose = canPropose(user);
  const mayReview = canReview(user);
  const showActions = mayPropose || (mayReview && v.status === "in_review");

  return (
    <div>
      <Link href="/admin/registry">← Registry</Link>
      <div className="adm-page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="adm-section-label">{v.kind}</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            {v.label}
          </h1>
          <div className="mono muted">
            {v.id} · v{v.version}
            {current && current.version_id !== v.version_id ? ` · viewing an older version (current is v${current.version})` : ""}
          </div>
        </div>
        <div className="chip-row">
          <StatusChip status={v.status} />
        </div>
      </div>

      {actionError ? (
        <div className="notice notice-error" style={{ marginTop: 12 }}>
          {actionError.message}
          {actionError.code ? (
            <span className="muted">
              {" "}
              · <span className="mono">{actionError.code}</span>
              {CODE_HINT[actionError.code] ? ` — ${CODE_HINT[actionError.code]}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      {actionOk ? (
        <div className="notice notice-ok" style={{ marginTop: 12 }}>
          {actionOk}
        </div>
      ) : null}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <div className="adm-section-label">Value</div>
            <div className="value-line">
              <span className="value-big">{v.value.type === "table" || v.value.type === "reference" ? fmtValue(v.value, "") : fmtValue(v.value, v.unit)}</span>
              <Evidence level={v.level} geography={v.geography} grounding={v.grounding} />
            </div>
            {v.value.type === "table" ? <ValueTable columns={v.value.columns} rows={v.value.rows} /> : null}
            {v.value.type === "reference" ? (
              <div className="mono small" style={{ marginTop: 8 }}>
                {v.value.uri}
                {v.value.checksum ? <span className="muted"> · {v.value.checksum}</span> : null}
              </div>
            ) : null}
            <dl className="dl" style={{ marginTop: 14 }}>
              <dt>Unit</dt>
              <dd>{v.unit || "—"}</dd>
              <dt>Valid range</dt>
              <dd className="num">{fmtRange(v.valid_range)}</dd>
              <dt>Level</dt>
              <dd>
                {v.level} · <span className="mono">{v.geography}</span>
              </dd>
              <dt>Grounding</dt>
              <dd>{GROUNDING_LABEL[v.grounding]}</dd>
              <dt>Note</dt>
              <dd>{v.note || "—"}</dd>
              <dt>Used by</dt>
              <dd>{v.used_by.length ? <span className="mono">{v.used_by.join(", ")}</span> : <span className="muted">nothing reads this entry yet</span>}</dd>
            </dl>
          </section>

          <section className="card">
            <div className="adm-section-label">Source</div>
            <p className="citation">{v.source.citation}</p>
            <dl className="dl">
              <dt>Source type</dt>
              <dd>{SOURCE_TYPE_LABEL[v.source.source_type] ?? v.source.source_type}</dd>
              <dt>Year</dt>
              <dd className="num">{v.source.source_year ?? "—"}</dd>
              <dt>URL / file</dt>
              <dd>
                {v.source.source_url ? (
                  /^https?:\/\//.test(v.source.source_url) ? (
                    <a href={v.source.source_url} target="_blank" rel="noreferrer" className="mono">
                      {v.source.source_url}
                    </a>
                  ) : (
                    <span className="mono">{v.source.source_url}</span>
                  )
                ) : (
                  "—"
                )}
              </dd>
              <dt>Locator</dt>
              <dd>{v.source.locator || "—"}</dd>
              <dt>Citation ids</dt>
              <dd>{v.source.citation_ids.length ? <span className="mono">{v.source.citation_ids.join(", ")}</span> : "—"}</dd>
            </dl>
          </section>

          <section className="card">
            <div className="adm-section-label">Provenance</div>
            <dl className="dl">
              <dt>Author</dt>
              <dd className="mono">{v.author}</dd>
              <dt>Reviewer</dt>
              <dd className="mono">{v.reviewer ?? "—"}</dd>
              <dt>Created</dt>
              <dd>{fmtDate(v.created_at)}</dd>
              <dt>Approved</dt>
              <dd>{fmtDate(v.approved_at)}</dd>
              <dt>Supersedes</dt>
              <dd>
                {v.supersedes ? (
                  <button type="button" className="link-btn mono" onClick={() => setSelected(v.supersedes)}>
                    {v.supersedes}
                  </button>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Change reason</dt>
              <dd>{v.change_reason || "—"}</dd>
              <dt>Review note</dt>
              <dd>{v.review_note || "—"}</dd>
            </dl>
          </section>

          <section className="card">
            <div className="adm-section-label">Diff</div>
            {versions.length < 2 ? (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Only one version so far; nothing to compare.
              </p>
            ) : (
              <>
                <div className="diff-pick">
                  <select className="select" value={diffA} onChange={(e) => setDiffA(e.target.value)} aria-label="From version">
                    {versions.map((x) => (
                      <option key={x.version_id} value={x.version_id}>
                        v{x.version} · {x.status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <span className="muted">→</span>
                  <select className="select" value={diffB} onChange={(e) => setDiffB(e.target.value)} aria-label="To version">
                    {versions.map((x) => (
                      <option key={x.version_id} value={x.version_id}>
                        v{x.version} · {x.status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                {diffError ? <div className="notice notice-error">{diffError}</div> : null}
                {diff && diff.length === 0 ? <p className="muted">No differences between these versions.</p> : null}
                {diff && diff.length ? (
                  <table className="table diff-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>From</th>
                        <th>To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((c) => (
                        <tr key={c.field}>
                          <td className="mono">{c.field}</td>
                          <td className="diff-from">{fmtAny(c.from)}</td>
                          <td className="diff-to">{fmtAny(c.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </>
            )}
          </section>
        </div>

        <aside className="detail-side">
          {showActions ? (
            <section className="card">
              <div className="adm-section-label">Actions</div>
              <div className="actions">
                {mayPropose ? (
                  <button type="button" className="btn btn-primary" onClick={() => setProposing(true)} disabled={!!busy}>
                    Propose new version
                  </button>
                ) : null}
                {mayPropose && v.status === "draft" ? (
                  <button type="button" className="btn" onClick={() => void act("Submitted", `/api/registry/${vid}/submit`)} disabled={!!busy}>
                    {busy === "Submitted" ? "Submitting…" : "Submit for review"}
                  </button>
                ) : null}
                {mayReview && v.status === "in_review" ? (
                  <>
                    <div className="field">
                      <label htmlFor="review-note">Review note</label>
                      <textarea id="review-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional on approve, required on reject" />
                    </div>
                    <div className="chip-row">
                      <button type="button" className="btn btn-primary" onClick={() => void act("Approved", `/api/registry/${vid}/approve`, { note: note.trim() || null })} disabled={!!busy}>
                        {busy === "Approved" ? "Approving…" : "Approve"}
                      </button>
                      <button type="button" className="btn" onClick={() => void act("Rejected", `/api/registry/${vid}/reject`, { note: note.trim() })} disabled={!!busy || !note.trim()} title={note.trim() ? undefined : "A rejection needs a note"}>
                        {busy === "Rejected" ? "Rejecting…" : "Reject"}
                      </button>
                    </div>
                    {user && user.email === v.author ? <div className="small hint-warn">You authored this version; the two-person rule will refuse your approval.</div> : null}
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="adm-section-label">Version history</div>
            <ol className="history">
              {[...versions].reverse().map((x) => (
                <li key={x.version_id} className={x.version_id === v.version_id ? "is-current" : undefined}>
                  <button type="button" className="history-row" onClick={() => setSelected(x.version_id)} aria-current={x.version_id === v.version_id ? "true" : undefined}>
                    <div className="history-head">
                      <span className="history-v">v{x.version}</span>
                      <StatusChip status={x.status} />
                    </div>
                    <div className="small muted">
                      by <span className="mono">{x.author}</span> · {fmtDate(x.created_at)}
                    </div>
                    {x.reviewer ? (
                      <div className="small muted">
                        reviewed by <span className="mono">{x.reviewer}</span>
                        {x.approved_at ? ` · ${fmtDate(x.approved_at)}` : ""}
                      </div>
                    ) : null}
                    {x.change_reason ? <div className="small">{x.change_reason}</div> : null}
                    {x.review_note ? <div className="small muted">Note: {x.review_note}</div> : null}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ValueTable({ columns, rows }: { columns: string[]; rows: (number | string | null)[][] }) {
  const shown = rows.slice(0, 30);
  return (
    <div className="value-table-wrap">
      <table className="table value-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === "number" ? "num" : undefined}>
                  {cell === null ? "—" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length ? <div className="small muted">{rows.length - shown.length} more rows</div> : null}
    </div>
  );
}
