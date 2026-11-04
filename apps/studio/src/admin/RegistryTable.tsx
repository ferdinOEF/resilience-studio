/** Registry table: search, status filter, four stat tiles, one row per entry id with its current version. */
import { useEffect, useState } from "react";
import { api, canPropose, errorMessage, type RegistryEntry, type RegistryList, type Status } from "../api";
import { Link, navigate } from "../router";
import { useSession } from "../session";
import { setCounts } from "./counts";
import { EntryForm } from "./EntryForm";
import { Evidence, fmtValue, PendingBadge, SOURCE_TYPE_LABEL, StatusChip } from "./format";

type Filter = "" | Extract<Status, "in_review" | "approved" | "draft">;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "", label: "all" },
  { key: "in_review", label: "in review" },
  { key: "approved", label: "approved" },
  { key: "draft", label: "draft" }
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function entryHref(id: string): string {
  return `/admin/registry/${encodeURIComponent(id)}`;
}

export function RegistryTable() {
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [data, setData] = useState<RegistryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const dq = useDebounced(q.trim(), 250);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<RegistryList>(`/api/registry?q=${encodeURIComponent(dq)}&status=${filter}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
        if (!dq && !filter) setCounts(r.counts);
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, filter]);

  if (showForm) {
    return (
      <div>
        <div className="adm-section-label">Registry</div>
        <h1 className="adm-title" style={{ marginTop: 4 }}>
          New entry
        </h1>
        <EntryForm mode="new" onCancel={() => setShowForm(false)} onDone={(e: RegistryEntry) => navigate(entryHref(e.id))} />
      </div>
    );
  }

  const writesOk = data?.writes.ok ?? true;
  const counts = data?.counts;

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <div className="adm-section-label">Registry</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            Science registry
          </h1>
        </div>
        {canPropose(user) ? (
          <button type="button" className="btn btn-primary" disabled={!writesOk} onClick={() => setShowForm(true)}>
            New entry
          </button>
        ) : null}
      </div>

      {data && !writesOk ? <div className="notice">{data.writes.reason ?? "The registry is read-only."}</div> : null}

      <div className="tiles">
        <Tile label="Entries" n={counts?.total} sub={counts ? `${counts.placeholders} placeholder${counts.placeholders === 1 ? "" : "s"}` : undefined} />
        <Tile label="Approved" n={counts?.approved} />
        <Tile label="In review" n={counts?.in_review} sub="versions awaiting a reviewer" />
        <Tile label="Draft" n={counts?.draft} sub="versions" />
      </div>

      <div className="adm-toolbar">
        <input className="input" style={{ width: 320 }} type="search" placeholder="Search id, label or citation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the registry" />
        <div className="chip-row" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button key={f.key || "all"} type="button" className={`chip-filter${filter === f.key ? " is-active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {loading ? "Loading…" : data ? `${data.entries.length} shown` : ""}
        </span>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: "32%" }}>Entry</th>
            <th>Kind</th>
            <th style={{ width: "30%" }}>Value · level · grounding</th>
            <th>Status</th>
            <th>Source</th>
            <th className="num">Used by</th>
          </tr>
        </thead>
        <tbody>
          {data?.entries.map((e) => (
            <tr key={e.id} className="is-link" onClick={() => navigate(entryHref(e.id))}>
              <td>
                <Link href={entryHref(e.id)} className="row-title" onClick={(ev) => ev.stopPropagation()}>
                  {e.label}
                </Link>
                <div className="mono muted">{e.id}</div>
              </td>
              <td>{e.kind}</td>
              <td>
                <div className="value-cell">{fmtValue(e.value, e.unit)}</div>
                <Evidence level={e.level} geography={e.geography} grounding={e.grounding} />
              </td>
              <td>
                <div className="chip-row">
                  <StatusChip status={e.status} />
                  <PendingBadge n={e.pending} />
                </div>
                <div className="small muted">
                  v{e.version} · {e.versions} version{e.versions === 1 ? "" : "s"}
                </div>
              </td>
              <td>
                <div>{SOURCE_TYPE_LABEL[e.source_type] ?? e.source_type}</div>
                {e.citation_ids.length ? <div className="mono muted">{e.citation_ids.join(", ")}</div> : null}
              </td>
              <td className="num">{e.used_by.length}</td>
            </tr>
          ))}
          {data && data.entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No entries match.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, n, sub }: { label: string; n: number | undefined; sub?: string }) {
  return (
    <div className="tile">
      <div className="adm-section-label">{label}</div>
      <div className="tile-num">{n === undefined ? "—" : n.toLocaleString("en-IN")}</div>
      {sub ? <div className="small muted">{sub}</div> : null}
    </div>
  );
}
