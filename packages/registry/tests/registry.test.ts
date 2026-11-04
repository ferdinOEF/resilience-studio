import { describe, expect, it } from "vitest";
import { approve, buildSeed, diffVersions, draftVersion, EntrySchema, MemoryStore, PANJIM, RegistryError, RegistryService, reject, resolveEntry, staleness, submitForReview, type RegistryEntry } from "../src";

const base = {
  id: "hazards.params.highTideReferenceM",
  kind: "parameter",
  label: "Normal high tide (MHHW above MSL)",
  value: { type: "scalar", value: 0.6, low: 0.6, high: 1.0 },
  unit: "m",
  valid_range: [0.6, 1.0],
  level: "state",
  geography: "IN-GA",
  source: { citation: "Indian Naval Hydrographic Chart No. 2020 as quoted in Mormugao Port Trust (2016) capital-dredging ToR", source_type: "government_doc", source_year: 2016, source_url: null, locator: "levels above chart datum", citation_ids: [] },
  grounding: "reasoned_extrapolation",
  note: null
} as const;

describe("no source, no save", () => {
  it("refuses an entry without a citation", () => {
    const { source: _s, ...noSource } = base;
    expect(() => draftVersion(noSource, "alice", [])).toThrowError(RegistryError);
    try { draftVersion(noSource, "alice", []); } catch (e) { expect((e as RegistryError).code).toBe("no_source"); }
  });
  it("refuses an entry without a source type", () => {
    const bad = { ...base, source: { ...base.source, source_type: undefined } };
    expect(() => draftVersion(bad, "alice", [])).toThrowError(/source/);
  });
});

describe("versioning and the two-person rule", () => {
  it("creates v1 as draft, v2 supersedes v1 only on approval by someone else", async () => {
    const svc = new RegistryService(new MemoryStore());
    const v1 = await svc.propose(base, "alice");
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("draft");
    await svc.submit(v1.version_id);
    await expect(svc.approve(v1.version_id, "alice")).rejects.toMatchObject({ code: "two_person" });
    const a1 = await svc.approve(v1.version_id, "bob");
    expect(a1.status).toBe("approved");
    expect(a1.reviewer).toBe("bob");
    // an edit is a new version with a reason; the old one stays until the new one is approved
    await expect(svc.propose({ ...base, value: { type: "scalar", value: 0.7 } }, "alice")).rejects.toMatchObject({ code: "invalid" });
    const v2 = await svc.propose({ ...base, value: { type: "scalar", value: 0.7 }, change_reason: "spring HHW re-read from the chart" }, "alice");
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe(v1.version_id);
    expect((await svc.submit(v2.version_id)).status).toBe("in_review");
    const r = await svc.reject(v2.version_id, "bob", "cite the chart sheet");
    expect(r.status).toBe("draft");
    expect(r.review_note).toBe("cite the chart sheet");
    await svc.submit(v2.version_id);
    await svc.approve(v2.version_id, "bob");
    const rows = await new RegistryService(new MemoryStore()).constructor.length; // keep lint quiet about unused helpers
    expect(rows).toBeDefined();
    const all = await (svc as unknown as { store: MemoryStore }).store.all();
    expect(all.find((x) => x.version === 1)?.status).toBe("superseded");
    expect(all.find((x) => x.version === 2)?.status).toBe("approved");
    expect(diffVersions(all[0], all[1]).map((d) => d.field)).toEqual(["value"]);
  });
  it("pure transitions guard their states", () => {
    const row = draftVersion(base, "alice", []);
    expect(() => reject(row, "bob", "x")).toThrow(/in review/);
    const inReview = submitForReview(row);
    expect(() => approve(inReview, "alice", [inReview])).toThrow(/Two-person/);
    expect(() => submitForReview(inReview)).toThrow(/draft/);
  });
});

describe("local overrides national", () => {
  const mk = (level: RegistryEntry["level"], geography: string, value: number, status: RegistryEntry["status"] = "approved"): RegistryEntry => ({
    ...(draftVersion({ ...base, level, geography, value: { type: "scalar", value } }, "alice", []) as RegistryEntry),
    version_id: `${base.id}@${level}`,
    status,
    reviewer: status === "approved" ? "bob" : null
  });
  it("picks the most local approved entry and names the level used", () => {
    const rows = [mk("global", "global", 0.5), mk("national", "IN", 0.55), mk("state", "IN-GA", 0.6)];
    const r = resolveEntry(rows, PANJIM)!;
    expect(r.levelUsed).toBe("state");
    expect(r.levelLabel).toBe("state value");
    expect(r.overrode).toEqual(["national", "global"]);
    const city = resolveEntry([...rows, mk("city", "IN-GA-panjim", 0.65)], PANJIM)!;
    expect(city.levelUsed).toBe("city");
  });
  it("ignores unapproved local entries in the studio but offers them on the admin side", () => {
    const rows = [mk("global", "global", 0.5), mk("city", "IN-GA-panjim", 0.65, "in_review")];
    expect(resolveEntry(rows, PANJIM)!.levelUsed).toBe("global");
    expect(resolveEntry(rows, PANJIM, { allowUnapproved: true })!.levelUsed).toBe("city");
    expect(resolveEntry([mk("city", "IN-GA-panjim", 0.65, "in_review")], PANJIM)).toBeNull();
  });
});

describe("stale scenarios", () => {
  it("flags a scenario once a value it used is superseded", async () => {
    const svc = new RegistryService(new MemoryStore());
    const v1 = await svc.propose(base, "alice");
    await svc.submit(v1.version_id);
    await svc.approve(v1.version_id, "bob");
    const store = (svc as unknown as { store: MemoryStore }).store;
    const used = [{ id: base.id, version_id: v1.version_id }];
    expect(staleness(used, await store.all()).stale).toBe(false);
    const v2 = await svc.propose({ ...base, value: { type: "scalar", value: 0.7 }, change_reason: "re-read" }, "alice");
    expect(staleness(used, await store.all()).stale).toBe(false); // a draft changes nothing yet
    await svc.submit(v2.version_id);
    await svc.approve(v2.version_id, "bob");
    const rep = staleness(used, await store.all());
    expect(rep.stale).toBe(true);
    expect(rep.changed[0]).toMatchObject({ id: base.id, used: v1.version_id, current: v2.version_id, reason: "superseded" });
  });
});

describe("seed from the ported data files", () => {
  const seed = buildSeed();
  it("ports every grounded value with its citation and grounding tag, nothing promoted", () => {
    expect(seed.entries.length).toBeGreaterThan(60);
    for (const e of seed.entries) {
      const parsed = EntrySchema.safeParse(e);
      if (!parsed.success) throw new Error(`${e.id}: ${JSON.stringify(parsed.error.issues)}`);
      expect(e.status).toBe("in_review");
      expect(e.source.citation.length).toBeGreaterThan(8);
    }
    const ids = seed.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("hazards.params.highTideReferenceM");
    expect(ids).toContain("solutions.mangrove.effects.level_attenuation_per_km.params.reductionCmPerKm");
    expect(ids).toContain("damage.curves.residential");
    expect(ids).toContain("hazards.seaLevelRise");
  });
  it("assigns levels: Panjim storm tide is a city value, MHHW a state value, McIvor a global value", () => {
    const by = Object.fromEntries(seed.entries.map((e) => [e.id, e]));
    expect(by["hazards.stormTideByRp.100"].level).toBe("city");
    expect(by["hazards.params.highTideReferenceM"].level).toBe("state");
    expect(by["solutions.mangrove.effects.level_attenuation_per_km.params.reductionCmPerKm"].level).toBe("global");
    expect(by["solutions.mangrove.effects.level_attenuation_per_km.params.reductionCmPerKm"].source.citation_ids).toContain("mcivor2012_surge");
  });
  it("leaves no parameter-like number outside the registry", () => {
    if (seed.uncovered.length) console.log("uncovered numbers:\n" + seed.uncovered.map((u) => `${u.path} = ${u.value}`).join("\n"));
    expect(seed.uncovered).toEqual([]);
  });
});
