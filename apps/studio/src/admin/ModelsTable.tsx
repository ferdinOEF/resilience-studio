/** Models: the contracts table (Admin mockup, MODEL REGISTRY · CONTRACTS) with the chain health line. Row click opens the contract. */
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { Link, navigate } from "../router";
import { setModelsCounts } from "./counts";
import { GroundingChip } from "./format";
import { CalibrationChip } from "./numbers";
import type { ModelContract, ModelsList, ModelSummary, Port } from "./types";

export function modelHref(id: string): string {
  return `/admin/models/${encodeURIComponent(id)}`;
}

/** "55 m · scope · event" for the first grid output, else the first output's type and time step. */
export function gridStep(outputs: Port[]): string {
  const grid = outputs.find((p) => p.dtype === "grid" || p.dtype === "mask") ?? outputs[0];
  if (!grid) return "—";
  const res = grid.grid.resolution_m !== null ? `${grid.grid.resolution_m} m` : grid.dtype;
  return `${res} · ${grid.grid.extent} · ${grid.timestep}`;
}

export function ChainHealth({ chain }: { chain: ModelsList["chain"] | null }) {
  if (!chain) return null;
  return (
    <div className={`chain-health${chain.ok ? "" : " is-failing"}`}>
      <span className={`dot ${chain.ok ? "dot-ok" : "dot-failed"}`} /> Model chain: {chain.ok ? "every declared hand-off passes the validator" : `${chain.failing} of ${chain.handoffs} hand-offs fail the validator`} · {chain.handoffs} hand-offs · water level → damage → people → loss
    </div>
  );
}

export function ModelsTable() {
  const [data, setData] = useState<ModelsList | null>(null);
  const [contracts, setContracts] = useState<Record<string, ModelContract>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<ModelsList>("/api/models")
      .then(async (m) => {
        if (!alive) return;
        setData(m);
        setModelsCounts(m);
        setError(null);
        // the list carries counts only; output names and grids come from each contract
        const full = await Promise.all(m.models.map((x) => api<{ model: ModelContract }>(`/api/models/${encodeURIComponent(x.id)}`).then((r) => r.model).catch(() => null)));
        if (!alive) return;
        setContracts(Object.fromEntries(full.filter((c): c is ModelContract => !!c).map((c) => [c.id, c])));
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div className="adm-page-head">
        <div>
          <div className="adm-section-label">Models</div>
          <h1 className="adm-title" style={{ marginTop: 4 }}>
            Model registry · contracts
          </h1>
          <div className="muted small">Every model in the mesh has a contract (spec section 2). A model is signed off only when its calibration passes and every registry entry it reads is approved.</div>
        </div>
      </div>
      <ChainHealth chain={data?.chain ?? null} />
      {data && !data.writes.ok ? <div className="notice">{data.writes.reason ?? "Model status is read-only."}</div> : null}
      {error ? <div className="notice notice-error">{error}</div> : null}

      <table className="table models-table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th style={{ width: "24%" }}>Model</th>
            <th>Kind</th>
            <th>Produces</th>
            <th>Grid · step</th>
            <th>Calibrated on</th>
            <th>Registry deps</th>
            <th>Agent</th>
            <th>Gate</th>
          </tr>
        </thead>
        <tbody>
          {data?.models.map((m) => (
            <ModelRow key={m.id} m={m} contract={contracts[m.id] ?? null} />
          ))}
          {data === null && !error ? (
            <tr>
              <td colSpan={8} className="muted" style={{ padding: 16 }}>
                Loading…
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ModelRow({ m, contract }: { m: ModelSummary; contract: ModelContract | null }) {
  const deps = m.registry_dependencies;
  return (
    <tr className="is-link" onClick={() => navigate(modelHref(m.id))}>
      <td>
        <Link href={modelHref(m.id)} className="row-title" onClick={(ev) => ev.stopPropagation()}>
          {m.name}
        </Link>
        <div className="mono muted small">
          {m.id} · v{m.version}
        </div>
        <div style={{ marginTop: 4 }}>
          <GroundingChip grounding={m.grounding} />
        </div>
      </td>
      <td>{m.kind}</td>
      <td className="small">
        {contract ? (
          contract.outputs.map((o) => (
            <div key={o.name}>
              <span className="mono">{o.name}</span> <span className="muted">· {o.unit}</span>
            </div>
          ))
        ) : (
          <span className="muted">{m.outputs} outputs</span>
        )}
      </td>
      <td className="small">{contract ? gridStep(contract.outputs) : "—"}</td>
      <td className="small">
        {m.calibration.events.length ? (
          m.calibration.events.map((e, i) => (
            <div key={`${e.event}-${i}`}>
              {e.event} <span className="muted">· {e.date}</span>
            </div>
          ))
        ) : (
          <span className="hint-warn">none yet</span>
        )}
        <div style={{ marginTop: 4 }}>
          <CalibrationChip status={m.calibration.status} />
        </div>
      </td>
      <td className="small">
        <div>
          <span className="num">{deps.approved}</span> approved of {deps.resolved} resolved
        </div>
        {deps.unapproved.length ? <div className="hint-warn">{deps.unapproved.length} not approved</div> : null}
        {deps.missing.length ? <div className="hint-warn">{deps.missing.length} missing</div> : null}
        {deps.resolved === 0 ? <div className="muted">reads no registry entry</div> : null}
      </td>
      <td className="small">
        <div className="mono">{m.agent.runner.replace(/^in-process:/, "")}</div>
        <div className="muted">
          in-process · {m.agent.retries} retr{m.agent.retries === 1 ? "y" : "ies"} · {m.agent.timeout_s} s timeout · {m.health}
        </div>
      </td>
      <td>
        <GateCell m={m} />
      </td>
    </tr>
  );
}

export function GateCell({ m }: { m: ModelSummary }) {
  if (m.gate.signed_off) return <span className="chip chip-status-approved">signed off</span>;
  return (
    <div className="chip-row">
      {m.gate.blocked_by.includes("calibration") ? <span className="chip chip-ground-placeholder">blocked by calibration</span> : null}
      {m.gate.unapproved_count ? <span className="chip chip-status-in_review">{m.gate.unapproved_count} unapproved</span> : null}
      {m.registry_dependencies.missing.length ? <span className="chip chip-status-in_review">{m.registry_dependencies.missing.length} missing</span> : null}
    </div>
  );
}
