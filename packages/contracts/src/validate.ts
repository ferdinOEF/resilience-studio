/**
 * The hand-off validator (spec section 2): a source output may feed a target input only when quantity, unit, CRS,
 * grid, time step and range match after the declared transform, and the source contract declares the route.
 */
import type { ModelContract, Port, Transform } from "./schema";
import { TransformSchema } from "./schema";

export type HandoffErrorCode = "no_output" | "no_input" | "no_route" | "quantity" | "unit" | "crs" | "grid" | "extent" | "timestep" | "range" | "dtype";

export interface HandoffCheck {
  ok: boolean;
  errors: { code: HandoffErrorCode; message: string }[];
  from: { model: string; output: string };
  to: { model: string; input: string };
  transform: Transform;
}

export interface Handoff {
  from_model: string;
  output: string;
  to_model: string;
  input: string;
  /** when absent, the transform of the source's routing rule applies */
  transform?: Partial<Transform>;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Validate one hand-off between two contracts. */
export function validateHandoff(source: ModelContract, target: ModelContract, h: Handoff): HandoffCheck {
  const errors: HandoffCheck["errors"] = [];
  const out = source.outputs.find((p) => p.name === h.output);
  const inp = target.inputs.find((p) => p.name === h.input);
  const rule = source.routing.find((r) => r.output === h.output && r.to_model === target.id && r.to_input === h.input);
  const transform = TransformSchema.parse({ ...(rule?.transform ?? {}), ...(h.transform ?? {}) });
  const result = (): HandoffCheck => ({ ok: errors.length === 0, errors, from: { model: source.id, output: h.output }, to: { model: target.id, input: h.input }, transform });
  if (!out) errors.push({ code: "no_output", message: `${source.id} has no output "${h.output}"` });
  if (!inp) errors.push({ code: "no_input", message: `${target.id} has no input "${h.input}"` });
  if (!out || !inp) return result();
  if (!rule) errors.push({ code: "no_route", message: `${source.id} declares no routing rule ${h.output} -> ${target.id}.${h.input}; the Liaison may not re-route outside the contract` });

  if (!eq(out.quantity, inp.quantity)) errors.push({ code: "quantity", message: `quantity ${out.quantity} cannot feed ${inp.quantity}` });

  // unit, after the declared conversion
  let factor = 1;
  if (!eq(out.unit, inp.unit)) {
    const c = transform.unit_conversion;
    if (c && eq(c.from, out.unit) && eq(c.to, inp.unit) && c.factor > 0) factor = c.factor;
    else errors.push({ code: "unit", message: `unit ${out.unit} does not match ${inp.unit} and no conversion ${out.unit} -> ${inp.unit} is declared` });
  }

  // CRS, after the declared reprojection
  if (!eq(out.crs, inp.crs)) {
    const r = transform.reproject;
    if (!(r && eq(r.from, out.crs) && eq(r.to, inp.crs))) errors.push({ code: "crs", message: `CRS ${out.crs} does not match ${inp.crs} and no reprojection is declared` });
  }

  // data type and grid
  if (out.dtype !== inp.dtype) {
    const aggregates = (out.dtype === "grid" || out.dtype === "mask") && (inp.dtype === "table" || inp.dtype === "scalar") && transform.aggregation !== "none";
    const regridsToGrid = out.dtype === "grid" && inp.dtype === "grid";
    // one scalar per event stacks into a table of events when a time-step alignment is declared (e.g. per return period)
    const stacksEvents = out.dtype === "scalar" && inp.dtype === "table" && transform.timestep !== "none";
    if (!aggregates && !regridsToGrid && !stacksEvents) errors.push({ code: "dtype", message: `${out.dtype} output cannot feed a ${inp.dtype} input without an aggregation` });
  }
  const ro = out.grid.resolution_m, ri = inp.grid.resolution_m;
  if (ro !== null && ri !== null && Math.abs(ro - ri) > 1e-6 && transform.regrid === "none") errors.push({ code: "grid", message: `grid ${ro} m does not match ${ri} m and no regrid method is declared` });
  if (out.grid.extent !== inp.grid.extent && inp.grid.extent !== "none" && transform.aggregation === "none") errors.push({ code: "extent", message: `extent ${out.grid.extent} does not match ${inp.grid.extent} and no aggregation is declared` });

  // time step
  if (out.timestep !== inp.timestep && inp.timestep !== "none" && transform.timestep === "none") errors.push({ code: "timestep", message: `time step ${out.timestep} does not match ${inp.timestep} and no alignment is declared` });

  // range: the converted output range must lie within the input's valid range
  const [omin, omax] = out.valid_range.map((v) => (v === null ? null : v * factor)) as [number | null, number | null];
  const [imin, imax] = inp.valid_range;
  if (imin !== null && (omin === null || omin < imin - 1e-9)) errors.push({ code: "range", message: `output range starts at ${omin ?? "-inf"} ${inp.unit}, below the input minimum ${imin}` });
  if (imax !== null && (omax === null || omax > imax + 1e-9)) errors.push({ code: "range", message: `output range ends at ${omax ?? "+inf"} ${inp.unit}, above the input maximum ${imax}` });
  return result();
}

/** Validate every hand-off of a planned chain against the contracts; the chain is runnable only when all pass. */
export function validateChain(contracts: ModelContract[], handoffs: Handoff[]): { ok: boolean; checks: HandoffCheck[] } {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const checks = handoffs.map((h) => {
    const s = byId.get(h.from_model), t = byId.get(h.to_model);
    if (!s || !t) {
      return { ok: false, errors: [{ code: (s ? "no_input" : "no_output") as HandoffErrorCode, message: `unknown model ${s ? h.to_model : h.from_model}` }], from: { model: h.from_model, output: h.output }, to: { model: h.to_model, input: h.input }, transform: TransformSchema.parse({}) };
    }
    return validateHandoff(s, t, h);
  });
  return { ok: checks.every((c) => c.ok), checks };
}

/** Check actual values against a port's valid range at run time (the Liaison's basic check on every hand-off). */
export function checkValues(port: Port, values: ArrayLike<number>): { ok: boolean; message: string; min: number; max: number; nan: number } {
  let min = Infinity, max = -Infinity, nan = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const [lo, hi] = port.valid_range;
  const problems: string[] = [];
  if (nan && port.dtype !== "grid") problems.push(`${nan} non-finite values`);
  if (lo !== null && min < lo - 1e-9) problems.push(`minimum ${min} below ${lo}`);
  if (hi !== null && max > hi + 1e-9) problems.push(`maximum ${max} above ${hi}`);
  return { ok: problems.length === 0, message: problems.length ? `${port.name}: ${problems.join("; ")}` : `${port.name}: ${values.length} values in [${lo ?? "-inf"}, ${hi ?? "+inf"}] ${port.unit}`, min, max, nan };
}

/** A model is signed_off only when its calibration says so AND every registry dependency it reads is approved. */
export function gateStatus(contract: ModelContract, approvedIds: Set<string>, allIds: string[]): { signed_off: boolean; missing: string[]; unapproved: string[] } {
  const deps = expandDependencies(contract.registry_dependencies, allIds);
  const missing = deps.filter((d) => !allIds.includes(d));
  const unapproved = deps.filter((d) => allIds.includes(d) && !approvedIds.has(d));
  return { signed_off: contract.calibration.status === "signed_off" && missing.length === 0 && unapproved.length === 0, missing, unapproved };
}

/** "hazards.params.*" expands to every registry id under that path. */
export function expandDependencies(patterns: string[], allIds: string[]): string[] {
  const out = new Set<string>();
  for (const p of patterns) {
    if (p.endsWith("*")) {
      const prefix = p.slice(0, -1);
      let any = false;
      for (const id of allIds) if (id.startsWith(prefix)) { out.add(id); any = true; }
      if (!any) out.add(p);
    } else out.add(p);
  }
  return [...out];
}
