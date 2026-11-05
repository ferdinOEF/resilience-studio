/**
 * Solutions catalogue (spec section 1.1, solutions layer): interventions expressed as changes to model inputs, with their
 * effect parameters read from the registry (level used and grounding beside every number), siting rules, the IPCC AR6
 * feasibility reference and the IUCN NbS checklist carried from the old repo's rubric.
 */
import { Hono } from "hono";
import { AREA, CITATIONS, RAW_DATA, SOLUTIONS, type SegmentDef } from "@resilience/core";
import { PANJIM, resolveAll } from "@resilience/registry";
import { registryStore } from "../registry";

export const solutions = new Hono();

solutions.get("/", async (c) => {
  const admin = c.req.query("admin") === "1";
  const all = await registryStore().all();
  const resolved = resolveAll(all, PANJIM, { allowUnapproved: admin });
  const segs = (AREA.segments as SegmentDef[]).map((s) => ({ id: s.id, name: s.name, setting: s.setting, khazanPresent: s.khazanPresent, settingNote: s.settingNote }));
  const param = (id: string, fallback: { value: number; low?: number; high?: number; unit: string; grounding: string; citations?: string[]; label?: string }) => {
    const r = resolved.get(id);
    if (!r || r.entry.value.type !== "scalar") return { registry_id: id, value: admin ? fallback.value : null, low: fallback.low ?? null, high: fallback.high ?? null, unit: fallback.unit, grounding: fallback.grounding, level_used: null, status: "not in the approved registry", citation_ids: fallback.citations ?? [], label: fallback.label ?? id };
    return { registry_id: id, value: r.entry.value.value, low: r.entry.value.low ?? null, high: r.entry.value.high ?? null, unit: r.entry.unit, grounding: r.entry.grounding, level_used: r.levelUsed, level_label: r.levelLabel, status: r.entry.status, version_id: r.entry.version_id, citation_ids: r.entry.source.citation_ids, citation: r.entry.source.citation, label: r.entry.label };
  };
  const items = SOLUTIONS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    summary: s.summary,
    evidence: s.evidence,
    hazard_components: s.hazardComponents,
    allowed_settings: s.allowedSettings,
    allowed_segments: segs.filter((g) => s.allowedSettings.includes(g.setting) || (g.khazanPresent && s.allowedSettings.includes("khazan"))).map((g) => g.id),
    place_as: s.placeAs ?? null,
    effects: s.effects.map((e) => ({ kind: e.kind, params: Object.fromEntries(Object.entries(e.params).map(([k, p]) => [k, param(`solutions.${s.id}.effects.${e.kind}.params.${k}`, p)])) })),
    instance_params: s.instanceParams.map((ip) => ({ ...param(`solutions.${s.id}.instanceParams.${ip.key}`, { value: ip.default, low: ip.min, high: ip.max, unit: ip.unit, grounding: ip.grounding, label: ip.label }), key: ip.key, step: ip.step, options: ip.options ?? null, note: ip.note ?? null })),
    ipcc_ar6_reference: s.ipccAr6Reference ?? null
  }));
  return c.json({ solutions: items, segments: segs, rubric: RAW_DATA.rubric, citations: Object.fromEntries(Object.entries(CITATIONS).map(([k, v]) => [k, { short: v.short, full: v.full }])), admin });
});
