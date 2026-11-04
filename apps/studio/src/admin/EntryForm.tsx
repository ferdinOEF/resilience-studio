/**
 * Entry form: a new entry or a new version of an existing one. "No source, no save": Save stays disabled until the
 * citation (min 8 chars) and the source type are filled. Body shaped like EntryInputSchema; POST /api/registry.
 */
import { cloneElement, isValidElement, useId, useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { api, errorMessage, GEOGRAPHY_DEFAULT, GROUNDINGS, KINDS, LEVELS, SOURCE_TYPES, type EntryInput, type EntryValue, type Grounding, type Kind, type Level, type RegistryEntry, type SourceType } from "../api";
import { GROUNDING_LABEL, SOURCE_TYPE_LABEL } from "./format";

type ValueMode = "scalar" | "expression" | "locked";

interface Fields {
  id: string;
  kind: Kind;
  label: string;
  valueMode: ValueMode;
  value: string;
  low: string;
  high: string;
  expression: string;
  unit: string;
  rangeLow: string;
  rangeHigh: string;
  level: Level;
  geography: string;
  grounding: Grounding;
  note: string;
  changeReason: string;
  citation: string;
  sourceType: SourceType | "";
  sourceYear: string;
  sourceUrl: string;
  locator: string;
  citationIds: string;
}

const ID_RE = /^[A-Za-z0-9_.:-]+$/;
const numStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function fromBase(base: RegistryEntry | undefined): Fields {
  const v = base?.value;
  return {
    id: base?.id ?? "",
    kind: base?.kind ?? "parameter",
    label: base?.label ?? "",
    valueMode: !v || v.type === "scalar" ? "scalar" : v.type === "expression" ? "expression" : "locked",
    value: v?.type === "scalar" ? numStr(v.value) : "",
    low: v?.type === "scalar" ? numStr(v.low) : "",
    high: v?.type === "scalar" ? numStr(v.high) : "",
    expression: v?.type === "expression" ? v.expression : "",
    unit: base?.unit ?? "",
    rangeLow: numStr(base?.valid_range?.[0]),
    rangeHigh: numStr(base?.valid_range?.[1]),
    level: base?.level ?? "city",
    geography: base?.geography ?? GEOGRAPHY_DEFAULT.city,
    grounding: base?.grounding ?? "solid_direct",
    note: base?.note ?? "",
    changeReason: "",
    citation: base?.source.citation ?? "",
    sourceType: base?.source.source_type ?? "",
    sourceYear: numStr(base?.source.source_year),
    sourceUrl: base?.source.source_url ?? "",
    locator: base?.source.locator ?? "",
    citationIds: base?.source.citation_ids.join(", ") ?? ""
  };
}

const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));
const optNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

function validate(f: Fields, mode: "new" | "version"): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.id.trim()) e.id = "An id is required";
  else if (!ID_RE.test(f.id.trim())) e.id = "Letters, digits, _ . : - only";
  if (!f.label.trim()) e.label = "A label is required";
  if (f.valueMode === "scalar") {
    if (!isNum(f.value)) e.value = "A number is required";
    if (f.low.trim() && !isNum(f.low)) e.low = "Number";
    if (f.high.trim() && !isNum(f.high)) e.high = "Number";
    if (isNum(f.low) && isNum(f.high) && Number(f.low) > Number(f.high)) e.high = "High must be ≥ low";
  }
  if (f.valueMode === "expression" && !f.expression.trim()) e.expression = "An expression is required";
  if (f.rangeLow.trim() && !isNum(f.rangeLow)) e.rangeLow = "Number";
  if (f.rangeHigh.trim() && !isNum(f.rangeHigh)) e.rangeHigh = "Number";
  if (!f.geography.trim()) e.geography = "A geography id is required";
  if (mode === "version" && !f.changeReason.trim()) e.changeReason = "A new version needs a change reason";
  if (f.citation.trim().length < 8) e.citation = "A full citation is required (at least 8 characters)";
  if (!f.sourceType) e.sourceType = "Pick a source type";
  if (f.sourceYear.trim()) {
    const y = Number(f.sourceYear);
    if (!Number.isInteger(y) || y < 1800 || y > 2100) e.sourceYear = "A year between 1800 and 2100";
  }
  return e;
}

export function EntryForm({ mode, base, onDone, onCancel }: { mode: "new" | "version"; base?: RegistryEntry; onDone: (entry: RegistryEntry) => void; onCancel: () => void }) {
  const [f, setF] = useState<Fields>(() => fromBase(base));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; code?: string } | null>(null);
  const errors = useMemo(() => validate(f, mode), [f, mode]);
  const sourceMissing = !!errors.citation || !!errors.sourceType;
  const canSave = Object.keys(errors).length === 0 && !busy;

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((p) => ({ ...p, [k]: v }));
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const err = (k: string) => (touched[k] || touched.__all ? errors[k] : undefined);

  const setLevel = (level: Level) => {
    setF((p) => {
      const wasDefault = p.geography.trim() === "" || p.geography === GEOGRAPHY_DEFAULT[p.level];
      return { ...p, level, geography: wasDefault ? GEOGRAPHY_DEFAULT[level] : p.geography };
    });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTouched({ __all: true });
    if (!canSave) return;
    let value: EntryValue;
    if (f.valueMode === "scalar") {
      value = { type: "scalar", value: Number(f.value) };
      if (f.low.trim()) value.low = Number(f.low);
      if (f.high.trim()) value.high = Number(f.high);
    } else if (f.valueMode === "expression") value = { type: "expression", expression: f.expression.trim() };
    else value = base!.value;
    const rangeLow = optNum(f.rangeLow);
    const rangeHigh = optNum(f.rangeHigh);
    const body: EntryInput = {
      id: f.id.trim(),
      kind: f.kind,
      label: f.label.trim(),
      value,
      unit: f.unit.trim(),
      valid_range: rangeLow === null && rangeHigh === null ? null : [rangeLow, rangeHigh],
      level: f.level,
      geography: f.geography.trim(),
      source: {
        citation: f.citation.trim(),
        source_type: f.sourceType as SourceType,
        source_year: optNum(f.sourceYear),
        source_url: f.sourceUrl.trim() || null,
        locator: f.locator.trim() || null,
        citation_ids: f.citationIds.split(",").map((s) => s.trim()).filter(Boolean)
      },
      grounding: f.grounding,
      note: f.note.trim() || null,
      change_reason: f.changeReason.trim() || null,
      used_by: base?.used_by ?? []
    };
    setBusy(true);
    setApiError(null);
    try {
      const r = await api<{ entry: RegistryEntry }>("/api/registry", { method: "POST", json: body });
      onDone(r.entry);
    } catch (e) {
      setApiError({ message: errorMessage(e), code: (e as { code?: string }).code });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Id" error={err("id")} hint={mode === "version" ? "Locked on a new version" : "letters, digits, _ . : -"}>
          <input className="input mono" value={f.id} readOnly={mode === "version"} disabled={mode === "version"} onChange={(e) => set("id", e.target.value)} onBlur={() => touch("id")} placeholder="e.g. slr.panjim.2050.ssp245" />
        </Field>
        <Field label="Kind">
          <select className="select" value={f.kind} onChange={(e) => set("kind", e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label" error={err("label")} span2>
          <input className="input" value={f.label} onChange={(e) => set("label", e.target.value)} onBlur={() => touch("label")} placeholder="Human-readable name" />
        </Field>

        <Field label="Value type">
          {f.valueMode === "locked" ? (
            <div className="input is-static">{base?.value.type === "table" ? "table" : "dataset reference"}</div>
          ) : (
            <select className="select" value={f.valueMode} onChange={(e) => set("valueMode", e.target.value as ValueMode)}>
              <option value="scalar">scalar</option>
              <option value="expression">expression</option>
            </select>
          )}
        </Field>
        {f.valueMode === "scalar" ? (
          <div className="field-row">
            <Field label="Value" error={err("value")}>
              <input className="input num" inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} onBlur={() => touch("value")} />
            </Field>
            <Field label="Low" error={err("low")}>
              <input className="input num" inputMode="decimal" value={f.low} onChange={(e) => set("low", e.target.value)} onBlur={() => touch("low")} />
            </Field>
            <Field label="High" error={err("high")}>
              <input className="input num" inputMode="decimal" value={f.high} onChange={(e) => set("high", e.target.value)} onBlur={() => touch("high")} />
            </Field>
          </div>
        ) : f.valueMode === "expression" ? (
          <Field label="Expression" error={err("expression")}>
            <input className="input mono" value={f.expression} onChange={(e) => set("expression", e.target.value)} onBlur={() => touch("expression")} placeholder="e.g. 0.5 * h ^ 2" />
          </Field>
        ) : (
          <Field label="Value">
            <div className="notice small">
              {base?.value.type === "table" ? `Table · ${base.value.rows.length} rows: edit tables via the API.` : "Dataset reference: edit via the API."} The current value is carried over unchanged.
            </div>
          </Field>
        )}

        <Field label="Unit">
          <input className="input" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="m, people, %, …" />
        </Field>
        <div className="field-row">
          <Field label="Valid range · low" error={err("rangeLow")}>
            <input className="input num" inputMode="decimal" value={f.rangeLow} onChange={(e) => set("rangeLow", e.target.value)} onBlur={() => touch("rangeLow")} />
          </Field>
          <Field label="Valid range · high" error={err("rangeHigh")}>
            <input className="input num" inputMode="decimal" value={f.rangeHigh} onChange={(e) => set("rangeHigh", e.target.value)} onBlur={() => touch("rangeHigh")} />
          </Field>
        </div>

        <Field label="Level">
          <select className="select" value={f.level} onChange={(e) => setLevel(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Geography" error={err("geography")} hint="Id of the area the value applies to">
          <input className="input mono" value={f.geography} onChange={(e) => set("geography", e.target.value)} onBlur={() => touch("geography")} placeholder={f.level === "site" ? "site id" : GEOGRAPHY_DEFAULT[f.level]} />
        </Field>

        <Field label="Grounding">
          <select className="select" value={f.grounding} onChange={(e) => set("grounding", e.target.value as Grounding)}>
            {GROUNDINGS.map((g) => (
              <option key={g} value={g}>
                {GROUNDING_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Optional" />
        </Field>

        {mode === "version" ? (
          <Field label="Change reason" error={err("changeReason")} span2 hint="Required: why this version supersedes the current one">
            <textarea className="textarea" value={f.changeReason} onChange={(e) => set("changeReason", e.target.value)} onBlur={() => touch("changeReason")} />
          </Field>
        ) : null}

        <fieldset className="source-block">
          <legend className="adm-section-label">Source · No source, no save</legend>
          <div className="form-grid">
            <Field label="Citation" error={err("citation")} span2 hint="Full citation text, as it would appear in CITATIONS.md">
              <textarea className="textarea" value={f.citation} onChange={(e) => set("citation", e.target.value)} onBlur={() => touch("citation")} />
            </Field>
            <Field label="Source type" error={err("sourceType")}>
              <select className="select" value={f.sourceType} onChange={(e) => set("sourceType", e.target.value as SourceType | "")} onBlur={() => touch("sourceType")}>
                <option value="">— pick one —</option>
                {SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_TYPE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source year" error={err("sourceYear")}>
              <input className="input num" inputMode="numeric" value={f.sourceYear} onChange={(e) => set("sourceYear", e.target.value)} onBlur={() => touch("sourceYear")} placeholder="YYYY" />
            </Field>
            <Field label="Source URL or file">
              <input className="input mono" value={f.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://… or a file reference" />
            </Field>
            <Field label="Locator" hint="Page, table or figure">
              <input className="input" value={f.locator} onChange={(e) => set("locator", e.target.value)} placeholder="e.g. Table 3, p. 42" />
            </Field>
            <Field label="Citation ids" span2 hint="Comma separated ids from the citation register">
              <input className="input mono" value={f.citationIds} onChange={(e) => set("citationIds", e.target.value)} placeholder="ipcc_ar6_wg1_slr, cstep2024" />
            </Field>
          </div>
        </fieldset>
      </div>

      {apiError ? (
        <div className="notice notice-error" style={{ marginTop: 14 }}>
          {apiError.message}
          {apiError.code ? <span className="mono muted"> · {apiError.code}</span> : null}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!canSave}>
          {busy ? "Saving…" : mode === "version" ? "Save as new version" : "Save draft"}
        </button>
        <button type="button" className="btn btn-lg" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <span className={`small ${sourceMissing ? "hint-warn" : "muted"}`}>{sourceMissing ? "No source, no save: add a citation and a source type." : "Saved as a draft; submit it for review from the entry page."}</span>
      </div>
    </form>
  );
}

function Field({ label, error, hint, span2, children }: { label: string; error?: string; hint?: string; span2?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className={`field${span2 ? " span2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children}
      {error ? <div className="err">{error}</div> : hint ? <div className="small muted">{hint}</div> : null}
    </div>
  );
}
