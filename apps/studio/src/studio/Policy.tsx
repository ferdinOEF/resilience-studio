/**
 * Policy (artboard 4): the status board, risks × instruments from the seeded clause map (every cell unassessed until
 * the Policy agent and an expert sign-off), and the selected cell's evidence chain on the right.
 */
import { useState } from "react";
import { Link, navigate } from "../router";
import type { Hazard } from "../admin/types";
import { HAZARDS } from "../admin/types";
import { useFetch, useStudio } from "./data";
import { Layout } from "./Shell";
import { GreyNote, SectionLabel } from "./ui";
import { STUDIO_HAZARD_LABEL, type ClauseMap, type LayerInfo } from "./types";

const STATE_LABEL: Record<string, string> = { covered: "Covered", partial: "Partial", gap: "Gap", conflict: "Conflict", unassessed: "Unassessed" };
const STATE_ORDER = ["covered", "partial", "gap", "conflict", "unassessed"];
const CORPUS_STATUS: Record<string, string> = { supplied: "supplied", public_not_fetched: "public, not fetched", not_yet_supplied: "not yet supplied" };

export function Policy() {
  const { panjim, runs, scenario, setScenario } = useStudio();
  const cm = useFetch<{ layer: LayerInfo; data: ClauseMap }>("/api/places/panjim/layers/policy_clause_map");
  const [sel, setSel] = useState<{ risk: string; instrument: string } | null>(null);
  const data = cm.data?.data ?? null;
  const risks = data?.risks ?? [];
  const instruments = data?.instruments ?? [];
  const stateOf = (risk: string, instrument: string) => data?.cells.find((c) => c.risk === risk && c.instrument === instrument)?.state ?? data?.default_state ?? "unassessed";
  const counts: Record<string, number> = {};
  for (const r of risks) for (const i of instruments) counts[stateOf(r.id, i.id)] = (counts[stateOf(r.id, i.id)] ?? 0) + 1;
  const selected = sel ?? (risks.length && instruments.length ? { risk: risks[0].id, instrument: instruments[0].id } : null);
  const risk = risks.find((r) => r.id === selected?.risk) ?? null;
  const instrument = instruments.find((i) => i.id === selected?.instrument) ?? null;
  const corpus = panjim?.manifest.policy_corpus.find((p) => p.id === instrument?.id) ?? null;
  const chainHazard = risk && (HAZARDS as readonly string[]).includes(risk.chain_hazard) ? (risk.chain_hazard as Hazard) : null;
  const riskRun = chainHazard ? (runs[chainHazard] ?? null) : null;
  const state = selected ? stateOf(selected.risk, selected.instrument) : "unassessed";
  const corpusCount = panjim?.manifest.policy_corpus.length ?? instruments.length;

  const board = (
    <div className="policy">
      <div className="policy-head">
        <h1 className="page-title">Policy status · Panjim</h1>
        <div className="muted">
          Rules in force checked against scenario results. {corpusCount} documents, {data?.clauses.length ?? 0} clauses mapped.
        </div>
        <div className="chip-row policy-legend">
          {STATE_ORDER.map((s) => (
            <span key={s} className={`chip chip-policy-${s}`}>
              {STATE_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      {cm.error ? <div className="muted">Clause map not loaded: {cm.error}</div> : null}
      {data ? (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                {instruments.map((i) => (
                  <th key={i.id} title={i.title}>
                    {i.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.title}</th>
                  {instruments.map((i) => {
                    const s = stateOf(r.id, i.id);
                    const on = selected?.risk === r.id && selected?.instrument === i.id;
                    return (
                      <td key={i.id}>
                        <button type="button" className={`pm-cell pm-${s}${on ? " is-selected" : ""}`} onClick={() => setSel({ risk: r.id, instrument: i.id })} aria-pressed={on} title={`${r.title} × ${i.title}: ${STATE_LABEL[s]}`}>
                          {STATE_LABEL[s]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="stat-tiles policy-tiles">
        {["covered", "partial", "gap", "conflict"].map((s) => (
          <div key={s} className="stat">
            <div className="stat-label">{s === "gap" ? "Gaps" : s === "conflict" ? "Conflicts" : STATE_LABEL[s]}</div>
            <div className="stat-num">{counts[s] ?? 0}</div>
          </div>
        ))}
        <div className="stat">
          <div className="stat-label">Unassessed</div>
          <div className="stat-num">{counts.unassessed ?? 0}</div>
        </div>
      </div>
      {data ? <div className="muted small">{data.note}</div> : null}
    </div>
  );

  const card = selected && risk && instrument ? (
    <>
      <div className="chip-row">
        <span className={`chip chip-policy-${state}`}>{STATE_LABEL[state]}</span>
        <span className="chip chip-kind">
          {risk.title} × {instrument.short}
        </span>
      </div>
      <h1 className="card-title" style={{ marginTop: 10 }}>
        No clause mapped yet
      </h1>
      <div className="muted small">{instrument.title}</div>
      <SectionLabel>Evidence chain</SectionLabel>
      <ol className="chain-list">
        <li>
          <span className="chain-n">1</span>
          <span>
            Scenario run for {risk.title}:{" "}
            {riskRun ? (
              <Link href={`/admin/runs/${encodeURIComponent(riskRun.id)}`} className="mono">
                {riskRun.id}
              </Link>
            ) : chainHazard ? (
              <span className="muted">not yet modelled to the studio standard</span>
            ) : (
              <span className="muted">not a chain hazard in this phase</span>
            )}
          </span>
        </li>
        <li>
          <span className="chain-n">2</span>
          <span>
            The instrument's clause: {instrument.short} · <span className="muted">{corpus ? CORPUS_STATUS[corpus.status] : "not in the corpus manifest"}</span>
            {corpus?.applicability === "to_confirm_clause_by_clause" ? <span className="muted"> · applicability to confirm clause by clause</span> : null}
          </span>
        </li>
        <li>
          <span className="chain-n">3</span>
          <span>
            The assessment: <span className="muted">awaiting the Policy agent and expert sign-off</span>
          </span>
        </li>
      </ol>
      <SectionLabel>Clause in question</SectionLabel>
      <GreyNote>No clause text: the instrument is not yet in the corpus.</GreyNote>
      <SectionLabel>Meta Mind finding</SectionLabel>
      <div className="card finding">
        <div className="chip-row">
          <span className="chip chip-status-in_review">Awaiting expert sign-off</span>
          <span className="chip chip-kind">Not a legal opinion</span>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          No finding: the Policy agent comes in a later phase. Findings reach the studio only after an expert signs them off.
        </div>
      </div>
      <div className="st-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!chainHazard}
          title={chainHazard ? undefined : "No chain hazard for this risk in Phase 1"}
          onClick={() => {
            if (chainHazard) setScenario({ ...scenario, hazard: chainHazard });
            navigate("/scenarios");
          }}
        >
          Open scenario{chainHazard ? ` · ${STUDIO_HAZARD_LABEL[chainHazard]}` : ""}
        </button>
        <button type="button" className="btn" disabled title="Comes with signed-off findings">
          Export brief
        </button>
      </div>
    </>
  ) : (
    <div className="muted">Select a cell of the board.</div>
  );

  return (
    <Layout view="policy" scale={null} card={card} cardWidth={420}>
      <div className="st-scroll">{board}</div>
    </Layout>
  );
}
