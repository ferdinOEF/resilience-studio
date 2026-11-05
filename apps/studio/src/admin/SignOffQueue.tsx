/**
 * Sign-off queue: policy findings, registry edits, calibration claims and chain sign-offs awaiting a human.
 * Filter by status, expand a row for the reasoning and payload, approve / reject (reviewer, admin; a rejection needs a
 * note; the two-person rule holds), and propose (scientist, admin).
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, canPropose, canReview, errorMessage } from "../api";
import { useSession } from "../session";
import { refreshCounts, setSignOffPending } from "./counts";
import { fmtDate } from "./format";
import { SIGNOFF_KINDS, type SignOffItem, type SignOffKind, type SignOffList, type SignOffStatus } from "./types";

export const KIND_LABEL: Record<SignOffKind, string> = { policy_finding: "policy finding", registry_edit: "registry edit", calibration_claim: "calibration claim", chain_sign_off: "chain sign-off" };

const CODE_HINT: Record<string, string> = {
  two_person: "Another reviewer or admin has to decide this item.",
  bad_state: "The item has already been decided.",
  invalid: "A rejection needs a note.",
  read_only: "The queue is read-only: no database is connected.",
  forbidden: "Your role cannot do this.",
  unauthenticated: "Sign in again."
};

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: Filter[] = ["pending", "approved", "rejected", "all"];

interface ActionError {
  message: string;
  code?: string;
}

function StatusChip({ status }: { status: SignOffStatus }) {
  const cls = status === "approved" ? "chip-status-approved" : status === "rejected" ? "chip-rejected" : "chip-status-in_review";
  return <span className={`chip ${cls}`}>{status}</span>;
}

export function SignOffQueue() {
  const { user } = useSession();
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<SignOffItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showPropose, setShowPropose] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<SignOffList>(`/api/signoff${filter === "all" ? "" : `?status=${filter}`}`);
      const sorted = [...r.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setItems(sorted);
      setError(null);
      if (filter === "pending" || filter === "all") setSignOffPending(r.counts.pending);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    }
  }, [filter]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const afterChange = (msg: string) => {
    setFlash(msg);
    void load();
    void refreshCounts();
  };

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <div className="adm-section-label">Sign-off queue</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            Sign-off queue
          </h1>
          <div className="muted small">The Meta Mind proposes, never applies. Author ≠ reviewer; nothing is published without a human.</div>
        </div>
        {canPropose(user) ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowPropose((s) => !s)} aria-expanded={showPropose}>
            {showPropose ? "Close" : "Propose"}
          </button>
        ) : null}
      </div>

      {showPropose && canPropose(user) ? (
        <ProposeForm
          onDone={(item) => {
            setShowPropose(false);
            setFilter("pending");
            setOpen(item.id);
            afterChange(`Proposed ${item.id}: ${item.title}.`);
          }}
          onCancel={() => setShowPropose(false)}
        />
      ) : null}

      <div className="adm-toolbar">
        <div className="chip-row" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`chip-filter${filter === f ? " is-active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {items ? `${items.length} item${items.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>

      {flash ? (
        <div className="notice notice-ok" style={{ marginTop: 0, marginBottom: 12 }}>
          {flash}
        </div>
      ) : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      <table className="table queue-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th style={{ width: "40%" }}>Title</th>
            <th>Proposed by</th>
            <th>Created</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((i) => (
            <QueueRow key={i.id} item={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} mayReview={canReview(user)} onDecided={afterChange} />
          ))}
          {items && items.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Nothing {filter === "all" ? "in the queue" : filter} right now.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function QueueRow({ item, open, onToggle, mayReview, onDecided }: { item: SignOffItem; open: boolean; onToggle: () => void; mayReview: boolean; onDecided: (msg: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<ActionError | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !note.trim()) {
      setErr({ message: "A rejection needs a note.", code: "invalid" });
      return;
    }
    setBusy(decision);
    setErr(null);
    try {
      const r = await api<{ item: SignOffItem }>(`/api/signoff/${encodeURIComponent(item.id)}/${decision}`, { method: "POST", json: { note: note.trim() || undefined } });
      onDecided(`${r.item.id} ${r.item.status} by ${r.item.decided_by}.`);
    } catch (e) {
      setErr({ message: errorMessage(e), code: e instanceof ApiError ? e.code : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <tr className="is-link" onClick={onToggle} aria-expanded={open}>
        <td>
          <span className="chip chip-kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
        </td>
        <td>
          <div className="row-title">{item.title}</div>
          <div className="mono muted small">{item.id}</div>
        </td>
        <td className="mono small">{item.proposed_by}</td>
        <td className="small">{fmtDate(item.created_at)}</td>
        <td>
          <StatusChip status={item.status} />
          {item.decided_by ? (
            <div className="small muted">
              by {item.decided_by} · {fmtDate(item.decided_at)}
            </div>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr className="queue-detail">
          <td colSpan={5}>
            <div className="queue-detail-grid">
              <div>
                <div className="adm-section-label">Reasoning</div>
                <p className="reasoning">{item.reasoning}</p>
                {item.decision_note ? (
                  <>
                    <div className="adm-section-label" style={{ marginTop: 10 }}>
                      Decision note
                    </div>
                    <p className="reasoning">{item.decision_note}</p>
                  </>
                ) : null}
                {mayReview && item.status === "pending" ? (
                  <div className="decide">
                    <div className="field">
                      <label htmlFor={`note-${item.id}`}>Note (required to reject)</label>
                      <input id={`note-${item.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <div className="form-actions" style={{ marginTop: 10 }}>
                      <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void decide("approve")}>
                        {busy === "approve" ? "Approving…" : "Approve"}
                      </button>
                      <button type="button" className="btn" disabled={busy !== null || !note.trim()} onClick={() => void decide("reject")}>
                        {busy === "reject" ? "Rejecting…" : "Reject"}
                      </button>
                    </div>
                    {err ? (
                      <div className="notice notice-error">
                        {err.message}
                        {err.code ? (
                          <span className="muted">
                            {" "}
                            · <span className="mono">{err.code}</span>
                            {CODE_HINT[err.code] ? ` — ${CODE_HINT[err.code]}` : ""}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="adm-section-label">Payload</div>
                <pre className="payload">{JSON.stringify(item.payload, null, 2)}</pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ProposeForm({ onDone, onCancel }: { onDone: (item: SignOffItem) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<SignOffKind>("calibration_claim");
  const [title, setTitle] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [payload, setPayload] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ActionError | null>(null);

  const payloadError = (() => {
    try {
      const v = JSON.parse(payload || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? null : "The payload must be a JSON object.";
    } catch {
      return "The payload is not valid JSON.";
    }
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (payloadError) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ item: SignOffItem }>("/api/signoff", { method: "POST", json: { kind, title: title.trim(), reasoning: reasoning.trim(), payload: JSON.parse(payload || "{}") } });
      onDone(r.item);
    } catch (ex) {
      setErr({ message: errorMessage(ex), code: ex instanceof ApiError ? ex.code : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card propose" onSubmit={submit} aria-label="Propose">
      <div className="adm-section-label">Propose · enters the queue with your reasoning attached</div>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="pr-kind">Kind</label>
          <select id="pr-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as SignOffKind)}>
            {SIGNOFF_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pr-title">Title</label>
          <input id="pr-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field span2">
          <label htmlFor="pr-reasoning">Reasoning</label>
          <textarea id="pr-reasoning" className="textarea" value={reasoning} onChange={(e) => setReasoning(e.target.value)} required />
        </div>
        <div className="field span2">
          <label htmlFor="pr-payload">Payload (JSON) · what approval would do, machine-readable</label>
          <textarea id="pr-payload" className="textarea mono" value={payload} onChange={(e) => setPayload(e.target.value)} style={{ minHeight: 56 }} />
          {payloadError ? <span className="err">{payloadError}</span> : null}
        </div>
      </div>
      {err ? (
        <div className="notice notice-error">
          {err.message}
          {err.code ? (
            <span className="muted">
              {" "}
              · <span className="mono">{err.code}</span>
              {CODE_HINT[err.code] ? ` — ${CODE_HINT[err.code]}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !reasoning.trim() || !!payloadError}>
          {busy ? "Proposing…" : "Propose"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
