/**
 * One model contract in full (inputs, outputs, routing, applicability, uncertainty, registry dependencies, agent) and
 * its Status card: calibration status and events, and for reviewer / admin the form that sets the status. A sign-off
 * is gated: every registry dependency approved and a calibration event recorded; the 409 is rendered inline.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, canReview, errorMessage } from "../api";
import { Link } from "../router";
import { useSession } from "../session";
import { refreshCounts } from "./counts";
import { entryHref } from "./RegistryTable";
import { fmtDate, fmtRange, GROUNDING_LABEL, GroundingChip } from "./format";
import { ChainHealth, gridStep } from "./ModelsTable";
import { CALIBRATION_LABEL, CalibrationChip } from "./numbers";
import type { CalibrationStatus, Gate, ModelContract, ModelsList, Port, Transform } from "./types";

const STATUSES: CalibrationStatus[] = ["uncalibrated", "calibrated", "signed_off"];

interface GateError {
  message: string;
  code?: string;
  unapproved?: string[];
  missing?: string[];
}

export function ModelDetail({ id }: { id: string }) {
  const { user } = useSession();
  const [model, setModel] = useState<ModelContract | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [list, setList] = useState<ModelsList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ model: ModelContract; gate: Gate }>(`/api/models/${encodeURIComponent(id)}`);
      setModel(r.model);
      setGate(r.gate);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
    api<ModelsList>("/api/models").then(setList).catch(() => undefined);
  }, [load]);

  if (error) {
    return (
      <div>
        <Link href="/admin/models">← Models</Link>
        <h1 className="adm-title" style={{ marginTop: 12 }}>
          {id}
        </h1>
        <div className="notice notice-error">{error}</div>
      </div>
    );
  }
  if (!model || !gate) return <div className="muted">Loading {id}…</div>;

  const summary = list?.models.find((m) => m.id === model.id) ?? null;

  return (
    <div>
      <Link href="/admin/models">← Models</Link>
      <div className="adm-page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="adm-section-label">
            {model.kind} model · v{model.version}
          </div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            {model.name}
          </h1>
          <div className="mono muted">{model.id}</div>
          <div className="chip-row" style={{ marginTop: 8 }}>
            <GroundingChip grounding={model.grounding} />
            <CalibrationChip status={model.calibration.status} />
            {gate.signed_off ? <span className="chip chip-status-approved">gate open · signed off</span> : <span className="chip chip-status-draft">gate closed</span>}
          </div>
        </div>
      </div>
      {model.description ? <p className="muted" style={{ maxWidth: 820 }}>{model.description}</p> : null}
      <ChainHealth chain={list?.chain ?? null} />

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <div className="adm-section-label">Inputs</div>
            <PortTable ports={model.inputs} />
          </section>
          <section className="card">
            <div className="adm-section-label">Outputs</div>
            <PortTable ports={model.outputs} />
            <div className="small muted" style={{ marginTop: 8 }}>
              Grid · step: {gridStep(model.outputs)}
            </div>
          </section>
          <section className="card">
            <div className="adm-section-label">Routing rules</div>
            {model.routing.length ? (
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Output</th>
                    <th>Feeds</th>
                    <th>Transform</th>
                  </tr>
                </thead>
                <tbody>
                  {model.routing.map((r, i) => (
                    <tr key={`${r.output}-${r.to_model}-${i}`}>
                      <td className="mono">{r.output}</td>
                      <td>
                        <Link href={`/admin/models/${encodeURIComponent(r.to_model)}`} className="mono">
                          {r.to_model}
                        </Link>
                        <span className="mono">.{r.to_input}</span>
                      </td>
                      <td className="small">
                        {transformLines(r.transform)}
                        {r.transform.note ? <div className="muted">{r.transform.note}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                End of the chain: this model feeds no other.
              </p>
            )}
          </section>
          <section className="card">
            <div className="adm-section-label">Applicability and uncertainty</div>
            <dl className="dl">
              <dt>Levels</dt>
              <dd>{model.applicability.levels.join(", ")}</dd>
              <dt>Conditions</dt>
              <dd>
                <ul className="plain-list">
                  {model.applicability.conditions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </dd>
              <dt>Uncertainty</dt>
              <dd>
                <strong>{model.uncertainty.kind}</strong> · {model.uncertainty.description}
              </dd>
              <dt>Grounding</dt>
              <dd>{GROUNDING_LABEL[model.grounding]}</dd>
            </dl>
          </section>
          <section className="card">
            <div className="adm-section-label">Registry dependencies</div>
            {model.registry_dependencies.length ? (
              <>
                <div className="small muted" style={{ marginTop: 6 }}>
                  Declared ids; a trailing * matches every entry under that path.
                  {summary ? ` ${summary.registry_dependencies.approved} approved of ${summary.registry_dependencies.resolved} resolved.` : ""}
                </div>
                <ul className="plain-list mono" style={{ marginTop: 6 }}>
                  {model.registry_dependencies.map((d) => (
                    <li key={d}>{d.endsWith("*") ? d : <Link href={entryHref(d)}>{d}</Link>}</li>
                  ))}
                </ul>
                {gate.unapproved.length ? (
                  <details style={{ marginTop: 10 }}>
                    <summary className="hint-warn">{gate.unapproved.length} resolved entries are not approved (the gate)</summary>
                    <ul className="plain-list mono small" style={{ marginTop: 6 }}>
                      {gate.unapproved.map((d) => (
                        <li key={d}>
                          <Link href={entryHref(d)}>{d}</Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {gate.missing.length ? (
                  <div className="hint-warn small" style={{ marginTop: 8 }}>
                    Missing from the registry: <span className="mono">{gate.missing.join(", ")}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Reads no registry entry.
              </p>
            )}
          </section>
          <section className="card">
            <div className="adm-section-label">Agent</div>
            <dl className="dl">
              <dt>Runner</dt>
              <dd className="mono">{model.agent.runner}</dd>
              <dt>Retries</dt>
              <dd>{model.agent.retries} · identical inputs only</dd>
              <dt>Timeout</dt>
              <dd>{model.agent.timeout_s} s</dd>
              <dt>Health</dt>
              <dd>{summary?.health ?? "—"}</dd>
            </dl>
          </section>
        </div>

        <div className="detail-side">
          <StatusCard model={model} gate={gate} mayReview={canReview(user)} writesOk={list?.writes.ok ?? true} onChanged={(m, g) => (setModel(m), setGate(g), void refreshCounts())} />
        </div>
      </div>
    </div>
  );
}

function transformLines(t: Transform) {
  const parts: string[] = [];
  if (t.regrid !== "none") parts.push(`regrid ${t.regrid}`);
  if (t.reproject) parts.push(`reproject ${t.reproject.from} → ${t.reproject.to}`);
  if (t.unit_conversion) parts.push(`unit ${t.unit_conversion.from} → ${t.unit_conversion.to} × ${t.unit_conversion.factor}`);
  if (t.merge !== "none") parts.push(`merge ${t.merge.replace(/_/g, " ")}`);
  if (t.timestep !== "none") parts.push(`time step ${t.timestep.replace(/_/g, " ")}`);
  if (t.aggregation !== "none") parts.push(`aggregate ${t.aggregation}`);
  return <div>{parts.length ? parts.join(" · ") : "none"}</div>;
}

function PortTable({ ports }: { ports: Port[] }) {
  return (
    <table className="table port-table" style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th>Port</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>CRS</th>
          <th>Grid</th>
          <th>Time step</th>
          <th>Range</th>
          <th>Required</th>
        </tr>
      </thead>
      <tbody>
        {ports.map((p) => (
          <tr key={p.name}>
            <td>
              <div className="mono">{p.name}</div>
              {p.description ? <div className="small muted">{p.description}</div> : null}
            </td>
            <td className="small">{p.quantity.replace(/_/g, " ")}</td>
            <td className="small">{p.unit}</td>
            <td className="small mono">{p.crs}</td>
            <td className="small">
              {p.dtype}
              {p.grid.resolution_m !== null ? ` · ${p.grid.resolution_m} m` : ""} · {p.grid.extent}
              {p.grid.extent_rule ? <div className="muted">{p.grid.extent_rule}</div> : null}
            </td>
            <td className="small">{p.timestep}</td>
            <td className="small num" style={{ textAlign: "left" }}>
              {fmtRange(p.valid_range)}
            </td>
            <td className="small">{p.required ? "yes" : "optional"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- status card */

function StatusCard({ model, gate, mayReview, writesOk, onChanged }: { model: ModelContract; gate: Gate; mayReview: boolean; writesOk: boolean; onChanged: (m: ModelContract, g: Gate) => void }) {
  const cal = model.calibration;
  const [status, setStatus] = useState<CalibrationStatus>(cal.status);
  const [withEvent, setWithEvent] = useState(false);
  const [event, setEvent] = useState("");
  const [date, setDate] = useState("");
  const [metrics, setMetrics] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [eventNote, setEventNote] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<GateError | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => setStatus(cal.status), [cal.status]);

  // a sign-off needs a calibration event on record; when none exists yet the form insists on one
  const eventRequired = status === "signed_off" && cal.events.length === 0;
  const eventOpen = withEvent || eventRequired;
  const validMetrics = metrics.filter((m) => m.name.trim() && m.value.trim() !== "" && Number.isFinite(Number(m.value)));
  const eventComplete = event.trim().length > 0 && date.trim().length >= 4 && validMetrics.length > 0 && eventNote.trim().length > 0;
  const canSubmit = !busy && writesOk && (!eventOpen || eventComplete);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = { status, note: note.trim() || undefined };
      if (eventOpen) body.event = { event: event.trim(), date: date.trim(), metrics: Object.fromEntries(validMetrics.map((m) => [m.name.trim(), Number(m.value)])), note: eventNote.trim() };
      const r = await api<{ model: ModelContract; gate: Gate }>(`/api/models/${encodeURIComponent(model.id)}/status`, { method: "POST", json: body });
      onChanged(r.model, r.gate);
      setOk(`${model.id} is now ${CALIBRATION_LABEL[r.model.calibration.status]}${r.gate.signed_off ? "; the gate is open" : ""}.`);
      setWithEvent(false);
      setEvent("");
      setDate("");
      setMetrics([{ name: "", value: "" }]);
      setEventNote("");
      setNote("");
    } catch (ex) {
      const data = ex instanceof ApiError ? (ex.data as { unapproved?: string[]; missing?: string[] } | undefined) : undefined;
      setErr({ message: errorMessage(ex), code: ex instanceof ApiError ? ex.code : undefined, unapproved: data?.unapproved, missing: data?.missing });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="adm-section-label">Status</div>
      <div className="value-line">
        <span className="value-big" style={{ fontSize: 18 }}>
          {CALIBRATION_LABEL[cal.status]}
        </span>
        <CalibrationChip status={cal.status} />
      </div>
      <dl className="dl">
        <dt>Gate</dt>
        <dd>
          {gate.signed_off ? "open: the studio may show this model's results" : "closed"}
          {!gate.signed_off ? (
            <div className="small muted">
              {cal.status !== "signed_off" ? "calibration not signed off" : ""}
              {gate.unapproved.length ? `${cal.status !== "signed_off" ? " · " : ""}${gate.unapproved.length} registry entries not approved` : ""}
              {gate.missing.length ? ` · ${gate.missing.length} dependencies missing` : ""}
            </div>
          ) : null}
        </dd>
        <dt>Signed off by</dt>
        <dd>{cal.signed_off_by ? <span className="mono">{cal.signed_off_by}</span> : "—"}</dd>
        <dt>Signed off at</dt>
        <dd>{fmtDate(cal.signed_off_at)}</dd>
      </dl>

      <div className="adm-section-label" style={{ marginTop: 14 }}>
        Calibration events
      </div>
      {cal.events.length ? (
        <ul className="event-list">
          {cal.events.map((ev, i) => (
            <li key={`${ev.event}-${i}`}>
              <div>
                <strong>{ev.event}</strong> <span className="muted">· {ev.date}</span>
              </div>
              <div className="small mono">
                {Object.entries(ev.metrics)
                  .map(([k, v]) => `${k} = ${v}`)
                  .join(" · ")}
              </div>
              {ev.note ? <div className="small muted">{ev.note}</div> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint-warn" style={{ margin: "6px 0 0" }}>
          None yet: Tauktae 2021 and the 2019 monsoon floods await observed extents (spec section 7).
        </p>
      )}

      {mayReview ? (
        <form onSubmit={submit} className="status-form" aria-label="Set calibration status">
          <div className="adm-section-label" style={{ marginTop: 16 }}>
            Set status
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="st-status">Calibration status</label>
            <select id="st-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as CalibrationStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CALIBRATION_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {!eventRequired ? (
            <label className="check small" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={withEvent} onChange={(e) => setWithEvent(e.target.checked)} /> record a calibration event
            </label>
          ) : (
            <div className="small hint-warn" style={{ marginTop: 8 }}>
              A sign-off needs a calibration event: name, date, at least one metric and a note.
            </div>
          )}
          {eventOpen ? (
            <fieldset className="event-block">
              <legend className="small">Calibration event</legend>
              <div className="field">
                <label htmlFor="st-event">Event</label>
                <input id="st-event" className="input" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Cyclone Tauktae" required />
              </div>
              <div className="field">
                <label htmlFor="st-date">Date</label>
                <input id="st-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <span className="field-label">Metrics</span>
                {metrics.map((m, i) => (
                  <div key={i} className="metric-row">
                    <input className="input" value={m.name} onChange={(e) => setMetrics((ms) => ms.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="extent_hit_rate" aria-label={`Metric ${i + 1} name`} />
                    <input className="input num" value={m.value} onChange={(e) => setMetrics((ms) => ms.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} placeholder="0.8" inputMode="decimal" aria-label={`Metric ${i + 1} value`} />
                    <button type="button" className="btn btn-sm" onClick={() => setMetrics((ms) => (ms.length > 1 ? ms.filter((_, k) => k !== i) : ms))} disabled={metrics.length === 1} aria-label="Remove metric">
                      −
                    </button>
                  </div>
                ))}
                <button type="button" className="link-btn small" style={{ alignSelf: "flex-start" }} onClick={() => setMetrics((ms) => [...ms, { name: "", value: "" }])}>
                  + metric
                </button>
              </div>
              <div className="field">
                <label htmlFor="st-enote">Note</label>
                <textarea id="st-enote" className="textarea" value={eventNote} onChange={(e) => setEventNote(e.target.value)} placeholder="What was compared, against which observation, and how it went." required />
              </div>
            </fieldset>
          ) : null}
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="st-note">Note (optional)</label>
            <input id="st-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err ? (
            <div className="notice notice-error">
              {err.message}
              {err.code ? (
                <span className="muted">
                  {" "}
                  · <span className="mono">{err.code}</span>
                </span>
              ) : null}
              {err.unapproved?.length ? (
                <details style={{ marginTop: 6 }} open>
                  <summary>{err.unapproved.length} registry entries not approved</summary>
                  <ul className="plain-list mono small">
                    {err.unapproved.map((d) => (
                      <li key={d}>
                        <Link href={entryHref(d)}>{d}</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {err.missing?.length ? (
                <div className="small" style={{ marginTop: 6 }}>
                  Missing: <span className="mono">{err.missing.join(", ")}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {ok ? <div className="notice notice-ok">{ok}</div> : null}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {busy ? "Saving…" : status === "signed_off" ? "Sign off" : "Set status"}
            </button>
            {!writesOk ? <span className="small hint-warn">Read-only: no database.</span> : null}
          </div>
        </form>
      ) : (
        <p className="small muted" style={{ marginTop: 14 }}>
          Reviewers and admins set the calibration status.
        </p>
      )}
    </section>
  );
}
