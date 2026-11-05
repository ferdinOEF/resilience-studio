/**
 * One run, to the Admin mockup: header with the audit export, the model chain strip (one card per model), the hand-off
 * panel for the selected model beside the agent log (newest first), the results digest with its three bounds, and
 * what the Meta Mind reads from the run (references only, never a number of its own).
 */
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api";
import { Link } from "../router";
import { fmtDate, GroundingChip } from "./format";
import { Bounds3, fmtCount, fmtCrore, fmtDuration, fmtInr, fmtKm2, fmtMetres, fmtPeople, fmtTime, HAZARD_LABEL, HORIZON_LABEL, PATHWAY_LABEL, RunStatusChip, SignedOffChip, StaleChip, whoClass, whoLabel } from "./numbers";
import { CHAIN_ORDER, type HandoffRecord, type ModelContract, type ModelsList, type ModelSummary, type Outlay, type RegistryVersionUsed, type ReturnPeriod, type RunRecord, type Transform } from "./types";

type ChainStatus = "ok" | "retried" | "failed" | "not run";

interface ChainCard {
  id: string;
  name: string;
  summary: ModelSummary | null;
  status: ChainStatus;
  executions: number;
  rps: number[];
  bounds: number;
  version: string | null;
  calibrationAtRun: string | null;
  planned: boolean;
}

export function RunPage({ id }: { id: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [outlay, setOutlay] = useState<Outlay | null>(null);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("water-level");
  const [contracts, setContracts] = useState<Record<string, ModelContract>>({});
  const [onlySelected, setOnlySelected] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ run: RunRecord; outlay: Outlay }>(`/api/runs/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!alive) return;
        setRun(r.run);
        setOutlay(r.outlay);
        setError(null);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    api<ModelsList>("/api/models")
      .then((m) => alive && setModels(m.models))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);

  // the selected model's full contract (inputs, uncertainty, registry dependencies), fetched once per model
  useEffect(() => {
    if (contracts[selected]) return;
    let alive = true;
    api<{ model: ModelContract }>(`/api/models/${encodeURIComponent(selected)}`)
      .then((r) => alive && setContracts((c) => ({ ...c, [selected]: r.model })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selected, contracts]);

  const cards = useMemo<ChainCard[]>(() => {
    if (!run) return [];
    const byId = new Map(models.map((m) => [m.id, m]));
    const plannedIds = new Set(run.plan.steps.map((s) => s.model));
    const order = [...CHAIN_ORDER, ...run.plan.steps.map((s) => s.model).filter((m) => !(CHAIN_ORDER as readonly string[]).includes(m))];
    return [...new Set(order)].map((mid) => {
      const steps = run.steps.filter((s) => s.model === mid);
      const rps = [...new Set(steps.map((s) => s.return_period).filter((x): x is ReturnPeriod => typeof x === "number"))].sort((a, b) => a - b) as number[];
      const status: ChainStatus = steps.some((s) => s.status === "failed") ? "failed" : steps.some((s) => s.status === "retried") ? "retried" : steps.length ? "ok" : "not run";
      const contract = run.contracts.find((c) => c.id === mid);
      const summary = byId.get(mid) ?? null;
      return {
        id: mid,
        name: summary?.name ?? mid,
        summary,
        status,
        executions: steps.length,
        rps,
        bounds: rps.length ? Math.round(steps.length / rps.length) : steps.length,
        version: steps[0]?.contract_version ?? contract?.version ?? null,
        calibrationAtRun: contract?.calibration_status ?? null,
        planned: plannedIds.has(mid)
      };
    });
  }, [run, models]);

  if (error) {
    return (
      <div>
        <Link href="/admin/runs">← Runs</Link>
        <h1 className="adm-title" style={{ marginTop: 12 }}>
          {id}
        </h1>
        <div className="notice notice-error">{error}</div>
      </div>
    );
  }
  if (!run) return <div className="muted">Loading {id}…</div>;

  const s = run.plan.scenario;
  const selectedCard = cards.find((c) => c.id === selected) ?? cards[0];
  const log = [...run.log].reverse().filter((l) => !onlySelected || !selectedCard || l.who === `${selectedCard.id} agent` || l.message.includes(selectedCard.id));

  return (
    <div className="run-page">
      <Link href="/admin/runs">← Runs</Link>
      <div className="adm-page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="adm-section-label">Run</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            <span className="mono" style={{ fontSize: 18 }}>
              {run.id}
            </span>{" "}
            · {HAZARD_LABEL[s.hazard] ?? s.hazard} · {s.solution_set.label}
          </h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Requested by <span className="mono">{run.requested_by}</span> · {fmtDate(run.created_at)} · duration {fmtDuration(run.duration_ms)} · RP {s.return_periods.map((r) => `1:${r}`).join(" / ")} · {HORIZON_LABEL[s.horizon]} · {PATHWAY_LABEL[s.pathway]}
            {s.bunds_failed ? " · bunds failed" : ""}
          </div>
          <div className="chip-row" style={{ marginTop: 8 }}>
            <RunStatusChip status={run.status} />
            <StaleChip stale={run.stale} />
            <SignedOffChip signedOff={run.chain_signed_off} />
            <span className="small muted">
              {run.steps.length} steps · {run.handoffs.filter((h) => h.step > 0).length} hand-offs · {run.registry_versions.length} registry versions
            </span>
          </div>
        </div>
        <a className="btn" href={`/api/runs/${encodeURIComponent(run.id)}/audit`} download={`${run.id}-audit.json`}>
          Export audit trail
        </a>
      </div>
      <p className="run-question">
        <span className="adm-section-label">Question</span> {run.plan.question}
        {run.plan.variant ? (
          <span className="small muted">
            {" "}
            · variant <span className="mono">{run.plan.variant.id}</span>: {run.plan.variant.reason}
          </span>
        ) : null}
      </p>
      {run.error ? <div className="notice notice-error">{run.error}</div> : null}

      <div className="adm-section-label" style={{ marginTop: 20 }}>
        Model chain
      </div>
      <div className="chain" role="tablist" aria-label="Model chain">
        {cards.map((c, i) => (
          <div key={c.id} className="chain-item">
            {i > 0 ? <span className="chain-arrow" aria-hidden="true">→</span> : null}
            <button type="button" role="tab" aria-selected={selectedCard?.id === c.id} className={`chain-card${selectedCard?.id === c.id ? " is-selected" : ""}${!c.planned ? " is-unplanned" : ""}`} onClick={() => setSelected(c.id)}>
              <div className="chain-head">
                <span className={`dot dot-${c.status.replace(" ", "-")}`} aria-label={c.status} />
                <span className="chain-name">{shortName(c.name)}</span>
              </div>
              <div className="small muted mono">
                {c.id}
                {c.version ? ` · v${c.version}` : ""}
              </div>
              <div className="small muted">{c.summary ? runnerLabel(c.summary.agent.runner) : "—"}</div>
              <div className="small">
                {c.planned ? (
                  c.executions ? (
                    <>
                      {c.executions} runs · {c.rps.length > 1 || c.id !== "loss" ? `${c.rps.length} RP${c.rps.length === 1 ? "" : "s"}` : "annual"} × {c.bounds} bounds
                    </>
                  ) : (
                    <span className="hint-warn">planned, did not run</span>
                  )
                ) : (
                  <span className="muted">not planned{c.id === "loss" ? " (one return period)" : ""}</span>
                )}
              </div>
              <div className="chip-row" style={{ marginTop: 6 }}>
                {c.summary ? <GroundingChip grounding={c.summary.grounding} /> : null}
                <span className={`chip chain-status chain-status-${c.status.replace(" ", "-")}`}>{c.status}</span>
              </div>
              {c.calibrationAtRun ? <div className="small muted">{c.calibrationAtRun.replace("_", " ")} at run time</div> : null}
            </button>
          </div>
        ))}
      </div>

      <div className="two-col">
        <section className="card">
          <div className="adm-section-label">Hand-off · {selectedCard ? shortName(selectedCard.name) : "—"}</div>
          {selectedCard ? <HandoffPanel run={run} model={selectedCard} contract={contracts[selectedCard.id] ?? null} names={new Map(cards.map((c) => [c.id, shortName(c.name)]))} /> : null}
        </section>
        <section className="card log-card">
          <div className="adm-page-head" style={{ alignItems: "center" }}>
            <div className="adm-section-label">Agent activity, newest first</div>
            <label className="check small muted">
              <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> only {selectedCard?.id ?? "selected"}
            </label>
          </div>
          <ol className="log" aria-label="Agent log">
            {log.map((l, i) => (
              <li key={`${l.t}-${i}`} className="log-row">
                <span className="log-time mono">{fmtTime(l.t)}</span>
                <span className={`log-who ${whoClass(l.who)}`}>{whoLabel(l.who)}</span>
                <span className="log-msg">{l.message}</span>
              </li>
            ))}
            {log.length === 0 ? <li className="muted small">No log lines.</li> : null}
          </ol>
        </section>
      </div>

      <ResultsDigest run={run} />

      <section className="card" style={{ marginTop: 16 }}>
        <div className="adm-section-label">What the Meta Mind reads from this</div>
        {outlay ? (
          <>
            <p className="outlay-summary">{outlay.summary}</p>
            <div className="small muted">References into this run's record (no number of its own):</div>
            <ul className="ref-list">
              {outlay.references.map((r) => (
                <li key={r.path}>
                  <span>{r.label}</span>
                  <span className="mono muted">
                    {r.run_id}.{r.path}
                  </span>
                </li>
              ))}
              {outlay.references.length === 0 ? <li className="muted">Nothing to reference: the run did not complete.</li> : null}
            </ul>
            {outlay.proposals.length ? <div className="small muted">{outlay.proposals.length} proposals for the sign-off queue.</div> : null}
          </>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </section>
    </div>
  );
}

function shortName(name: string): string {
  const i = name.indexOf(" (");
  return i > 0 ? name.slice(0, i) : name;
}
function runnerLabel(runner: string): string {
  return runner.replace(/^in-process:/, "in-process · ");
}

/* ---------------------------------------------------------------- hand-off panel */

function transformSummary(t: Transform): string {
  const parts: string[] = [];
  if (t.regrid && t.regrid !== "none") parts.push(`regrid ${t.regrid}`);
  if (t.reproject) parts.push(`reproject ${t.reproject.from} → ${t.reproject.to}`);
  if (t.unit_conversion) parts.push(`unit ${t.unit_conversion.from} → ${t.unit_conversion.to} × ${t.unit_conversion.factor}`);
  if (t.merge && t.merge !== "none") parts.push(`merge ${t.merge.replace(/_/g, " ")}`);
  if (t.timestep && t.timestep !== "none") parts.push(`time step ${t.timestep.replace(/_/g, " ")}`);
  if (t.aggregation && t.aggregation !== "none") parts.push(`aggregate ${t.aggregation}`);
  return parts.length ? parts.join(" · ") : "none required: same quantity, unit, CRS, grid and time step";
}

function matchesDependency(id: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith("*") ? id.startsWith(p.slice(0, -1)) : id === p));
}

function HandoffPanel({ run, model, contract, names }: { run: RunRecord; model: ChainCard; contract: ModelContract | null; names: Map<string, string> }) {
  const [showVersions, setShowVersions] = useState(false);
  const into = run.handoffs.filter((h) => h.to.model === model.id);
  const routes = new Map<string, HandoffRecord[]>();
  for (const h of into) {
    const k = `${h.from.model}.${h.from.output} → ${h.to.input}`;
    routes.set(k, [...(routes.get(k) ?? []), h]);
  }
  const versions: RegistryVersionUsed[] = contract ? run.registry_versions.filter((v) => matchesDependency(v.id, contract.registry_dependencies)) : run.registry_versions;

  return (
    <div className="handoff">
      <dl className="dl handoff-dl">
        <dt>Input from</dt>
        <dd>
          {routes.size === 0 ? (
            <div>
              <div>No model upstream: inputs come from the place pack and the registry.</div>
              {contract ? (
                <ul className="plain-list small muted">
                  {contract.inputs.map((p) => (
                    <li key={p.name}>
                      <span className="mono">{p.name}</span> · {p.quantity.replace(/_/g, " ")} · {p.unit}
                      {p.required ? "" : " · optional"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            [...routes.entries()].map(([k, recs]) => {
              const runtime = recs.filter((r) => r.step > 0);
              const planCheck = recs.find((r) => r.step === 0);
              const ok = runtime.filter((r) => r.ok).length;
              const codes = [...new Set(recs.flatMap((r) => r.errors.map((e) => e.code)))];
              const withValues = runtime.filter((r) => r.values);
              const min = withValues.length ? Math.min(...withValues.map((r) => r.values!.min)) : null;
              const max = withValues.length ? Math.max(...withValues.map((r) => r.values!.max)) : null;
              const last = withValues[withValues.length - 1]?.values;
              const first = recs[0];
              return (
                <div key={k} className="route">
                  <div className="route-title">
                    <span className="mono">
                      {names.get(first.from.model) ?? first.from.model}.{first.from.output}
                    </span>{" "}
                    → <span className="mono">{first.to.input}</span>
                  </div>
                  <dl className="dl route-dl">
                    <dt>Transform</dt>
                    <dd>
                      {transformSummary(first.transform)}
                      {first.transform.note ? <div className="small muted">{first.transform.note}</div> : null}
                    </dd>
                    <dt>Validator verdict</dt>
                    <dd>
                      <span className={codes.length ? "hint-warn" : "ok-ink"}>
                        {planCheck ? (planCheck.ok ? "plan check passed" : "plan check failed") : "no plan check"}
                        {runtime.length ? ` · ${ok} of ${runtime.length} run-time hand-offs passed` : ""}
                      </span>
                      {codes.length ? (
                        <div className="small">
                          error codes: <span className="mono">{codes.join(", ")}</span>
                          <ul className="plain-list">
                            {[...new Set(recs.flatMap((r) => r.errors.map((e) => e.message)))].slice(0, 4).map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </dd>
                    <dt>Value check</dt>
                    <dd>
                      {last ? (
                        <>
                          <div>{last.message}</div>
                          <div className="small muted">
                            observed over {withValues.length} hand-offs: min {fmtMetresOrNum(min!)} · max {fmtMetresOrNum(max!)}
                            {withValues.some((r) => r.values!.nan) ? ` · ${withValues.reduce((n, r) => n + r.values!.nan, 0)} non-finite` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="muted">no values checked (table input, validated by contract)</span>
                      )}
                    </dd>
                  </dl>
                </div>
              );
            })
          )}
        </dd>
        <dt>Uncertainty carried</dt>
        <dd>
          three bounds (low / central / high)
          {contract ? <div className="small muted">{contract.uncertainty.kind}: {contract.uncertainty.description}</div> : null}
        </dd>
        <dt>Source of parameters</dt>
        <dd>
          <button type="button" className="link-btn" onClick={() => setShowVersions((v) => !v)} aria-expanded={showVersions}>
            {versions.length} registry version{versions.length === 1 ? "" : "s"}
            {contract && versions.length !== run.registry_versions.length ? ` of ${run.registry_versions.length} read by the run` : ""}
          </button>
          <span className="small muted"> · local overrides national: the level used is shown beside each</span>
          {showVersions ? (
            <ul className="version-list">
              {versions.map((v) => (
                <li key={v.version_id}>
                  <span className="mono">{v.version_id.startsWith(v.id) ? v.version_id : `${v.id} · ${v.version_id}`}</span>
                  <span className="chip chip-level">{v.level_used} value</span>
                  <span className={`chip chip-status-${v.status}`}>{v.status.replace("_", " ")}</span>
                </li>
              ))}
              {versions.length === 0 ? <li className="muted small">This model declares no registry dependencies.</li> : null}
            </ul>
          ) : null}
        </dd>
      </dl>
    </div>
  );
}

function fmtMetresOrNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return fmtCount(n);
  return fmtMetres(n);
}

/* ---------------------------------------------------------------- results digest */

function ResultsDigest({ run }: { run: RunRecord }) {
  const r = run.result;
  const s = run.plan.scenario;
  if (!r) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <div className="adm-section-label">Results digest</div>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          No result: the run {run.status === "failed" ? "failed" : `is ${run.status}`}.
        </p>
      </section>
    );
  }
  const rows: { label: string; v: typeof r.totals.flooded_km2; fmt: (n: number) => string; title?: (n: number) => string }[] = [
    { label: "Flooded area (km²)", v: r.totals.flooded_km2, fmt: fmtKm2 },
    { label: "Behind bunds (km²)", v: r.totals.bunded_km2, fmt: fmtKm2 },
    { label: "People affected", v: r.totals.people_affected, fmt: fmtPeople },
    { label: "Direct damage (₹ crore)", v: r.totals.damage_inr, fmt: fmtCrore, title: fmtInr },
    { label: "Buildings wet", v: r.totals.buildings_wet, fmt: fmtCount }
  ];
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="adm-page-head" style={{ alignItems: "baseline" }}>
        <div>
          <div className="adm-section-label">Results digest</div>
          <div style={{ marginTop: 4 }}>
            Totals at the headline event <strong>1:{r.headline_return_period}</strong> · {HAZARD_LABEL[s.hazard]} · {HORIZON_LABEL[s.horizon]} · {PATHWAY_LABEL[s.pathway]} · {s.solution_set.label}
          </div>
        </div>
        <div className="small muted" style={{ textAlign: "right", maxWidth: 360 }}>
          Every figure carries its three bounds: <strong>low</strong> = least favourable end of every ranged input, <strong>central</strong> = the registry value at the level used, <strong>high</strong> = most favourable.
          {typeof r.depth_cell_count === "number" ? ` ${fmtCount(r.depth_cell_count)} depth cells kept for the map.` : ""}
        </div>
      </div>

      <table className="table totals-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Quantity</th>
            <th className="num">Low</th>
            <th className="num">Central</th>
            <th className="num">High</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num" title={row.title ? row.title(row.v.low) : undefined}>
                {row.fmt(row.v.low)}
              </td>
              <td className="num central" title={row.title ? row.title(row.v.central) : undefined}>
                {row.fmt(row.v.central)}
              </td>
              <td className="num" title={row.title ? row.title(row.v.high) : undefined}>
                {row.fmt(row.v.high)}
              </td>
            </tr>
          ))}
          {r.annual ? (
            <>
              <tr>
                <td>
                  Expected annual damage (₹ crore / year) <span className="small muted">· trapezoid over {r.by_return_period.length} return periods</span>
                </td>
                <td className="num" title={fmtInr(r.annual.ead_inr.low)}>
                  {fmtCrore(r.annual.ead_inr.low)}
                </td>
                <td className="num central" title={fmtInr(r.annual.ead_inr.central)}>
                  {fmtCrore(r.annual.ead_inr.central)}
                </td>
                <td className="num" title={fmtInr(r.annual.ead_inr.high)}>
                  {fmtCrore(r.annual.ead_inr.high)}
                </td>
              </tr>
              <tr>
                <td>People affected per year</td>
                <td className="num">{fmtPeople(r.annual.people_per_year.low)}</td>
                <td className="num central">{fmtPeople(r.annual.people_per_year.central)}</td>
                <td className="num">{fmtPeople(r.annual.people_per_year.high)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={4} className="muted small">
                No annual expectation: one return period only.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="digest-grid">
        <div>
          <div className="adm-section-label" style={{ marginTop: 16 }}>
            By segment · at 1:{r.headline_return_period} · low · <strong>central</strong> · high
          </div>
          <div className="table-wrap">
          <table className="table seg-table">
            <thead>
              <tr>
                <th>Segment</th>
                <th className="num">Shoreline WL (m)</th>
                <th className="num">Flooded (km²)</th>
                <th className="num">People</th>
                <th className="num">Damage</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {r.per_segment.map((seg) => (
                <tr key={seg.id}>
                  <td className="mono">{seg.id}</td>
                  <td className="num">
                    <Bounds3 v={seg.shoreline_wl_m} fmt={fmtMetres} />
                  </td>
                  <td className="num">
                    <Bounds3 v={seg.flooded_km2} fmt={fmtKm2} />
                  </td>
                  <td className="num">
                    {seg.people === null ? "—" : fmtPeople(seg.people)} <span className="small muted">central</span>
                  </td>
                  <td className="num" title={seg.damage_inr === null ? undefined : fmtInr(seg.damage_inr)}>
                    {seg.damage_inr === null ? "—" : fmtCrore(seg.damage_inr)} <span className="small muted">central</span>
                  </td>
                  <td className="small">{seg.flags.length ? seg.flags.map((f) => <div key={f} className="hint-warn">{f}</div>) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div>
          <div className="adm-section-label" style={{ marginTop: 16 }}>
            By return period · low · <strong>central</strong> · high
          </div>
          <div className="table-wrap">
          <table className="table rp-table">
            <thead>
              <tr>
                <th>Return period</th>
                <th className="num">Damage (₹ crore)</th>
                <th className="num">People</th>
              </tr>
            </thead>
            <tbody>
              {r.by_return_period.map((row) => (
                <tr key={row.rp}>
                  <td>1:{row.rp}</td>
                  <td className="num">
                    <Bounds3 v={row.damage_inr} fmt={fmtCrore} title={fmtInr} />
                  </td>
                  <td className="num">
                    <Bounds3 v={row.people} fmt={fmtPeople} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </section>
  );
}
