import { DERIVED, ELEV_M, GRID, IN_SCOPE, SLR, modelContext } from "../src/data";
import { runEvent } from "../src/engine/model";
import type { ScenarioId } from "../src/engine/types";

const ctx = modelContext();
const run = (sc: ScenarioId, slrM = 0, hz = ctx.hazard) => runEvent(ctx, sc, [], "central", hz, slrM, {});

describe("scope", () => {
  it("never floods or analyses land across the Mandovi", () => {
    const { ext } = run("compound", 0.5);
    for (const i of [...ext.floodedCells, ...ext.bundedCells, ...ext.wetTideCells]) expect(IN_SCOPE[i]).toBe(1);
  });
});

describe("connected fill", () => {
  it("floods more land as sea level rises", () => {
    const a = run("slr", 0.2).sum.floodedKm2, b = run("slr", 0.56).sum.floodedKm2, c = run("slr", 1.05).sum.floodedKm2;
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(c).toBeGreaterThan(0);
  });
  it("floods only cells connected to water through lower ground", () => {
    const { ext } = run("slr", 1.05);
    const wet = new Set([...ext.floodedCells, ...ext.bundedCells, ...ext.wetTideCells]);
    for (const i of ext.floodedCells) {
      const r = Math.floor(i / GRID.cols), c = i % GRID.cols;
      let ok = false;
      for (let dr = -1; dr <= 1 && !ok; dr++) for (let dc = -1; dc <= 1 && !ok; dc++) {
        if (!dr && !dc) continue;
        const j = (r + dr) * GRID.cols + (c + dc);
        if (wet.has(j) || DERIVED.isFlowPath[j]) ok = true;
      }
      expect(ok).toBe(true);
    }
  });
  it("puts land wet at today's high tide in its own class, never in newly flooded", () => {
    const { ext } = run("slr", 0.5);
    const today = new Set(run("slr", 0).ext.wetTideCells);
    for (const i of ext.floodedCells) expect(today.has(i)).toBe(false);
    // below MHHW; since Phase 3 (A1) also mangrove, ponds and creek gaps below spring high water
    for (const i of ext.wetTideCells) {
      const tidal = ["M", "W"].includes(DERIVED.grid.cls[i]) || DERIVED.isFlowPath[i] === 1;
      expect(ELEV_M[i]).toBeLessThan(tidal ? ctx.hazard.springHighWaterM : ctx.hazard.highTideReferenceM);
    }
  });
  it("the high tide + SLR layer floods only land below MHHW + SLR", () => {
    const { ext } = run("slr", 0.56);
    for (const i of ext.floodedCells) expect(ELEV_M[i]).toBeLessThan(ctx.hazard.highTideReferenceM + 0.56);
  });
});

describe("IPCC AR6 sea-level data, Mormugao (audit M6/M7)", () => {
  it("carries 2050 and 2100 for three SSPs, median inside the likely range, local and global", () => {
    for (const t of [SLR.horizons, SLR.global.horizons]) {
      for (const h of ["2050", "2100"] as const) {
        for (const k of ["ssp126", "ssp245", "ssp585"] as const) {
          const [c, lo, hi] = t[h][k];
          expect(lo).toBeLessThanOrEqual(c);
          expect(c).toBeLessThanOrEqual(hi);
        }
      }
    }
    expect(SLR.horizons["2100"].ssp585[0]).toBe(0.75); // Mormugao, AR6 tool (global median 0.77 m kept in Reference)
    expect(SLR.global.horizons["2100"].ssp585[0]).toBe(0.77);
    expect(SLR.station.psmslId).toBe(1249);
  });
});
