# Regression log: old → new values

The regression scenario (`packages/core/tests/regression.test.ts`, four layers: surge, flood, compound, rain; 241 pinned leaf values, 207 of them numbers, in
`tests/__snapshots__/regression.test.ts.snap`) is the contract that the ported engine gives the same answers as the engine it
came from. Every value change is logged here, old → new, with the finding that caused it.

## Port from `coastal-resilience-studio` (commit cb732bd, 23 Oct 2026) → `packages/core`, 4 Nov 2026

The model-audit fixes M1–M18 (phases P0, P1, P2, plus the DeltaDTM switch and Phase 3 A1–A10) were already applied in the
source repo; their old → new tables, sensitivity tables and sources are preserved verbatim in `MODEL_AUDIT_LOG_ported.md`.
The port copies `src/core/*` → `packages/core/src/engine/*` and `src/data/*` → `packages/core/src/data/*` unchanged except:

- `data/index.ts`: the Vite-only `import.meta.glob` that picked the DEM grid is replaced by two static imports (`DEM_SOURCE` still selects DeltaDTM);
  import paths follow the move; the case-study source file moved beside the data files.
- Tests: import paths only. `vitest` test timeout raised to 60 s (the grids load once per worker).

**Result: 241 of 241 pinned values unchanged (0 changed).** `pnpm --filter @resilience/core test`: 104 tests pass.

| Layer | Values changed | Old → new |
|---|---|---|
| surge | 0 | — |
| flood | 0 | — |
| compound | 0 | — |
| rain | 0 | — |

What was deliberately not ported (spec §6): the old UI, the five-tab/two-mode workspace, the scope veil, anything tied to sql.js.

## Provenance check, 5 Nov 2026: which commit was ported, and did it already carry M1–M18?

Question asked by Ferdin: which commit of `coastal-resilience-studio` was ported, and were the model-audit fixes
(`feature/model-p0`, `-p1`, `-p2`; findings M1–M18) already merged in it? If not, spec §6 requires applying them in
`packages/core` and logging every value change. Checked read-only against the old repository's git history on 5 Nov 2026.

**Ported commit.** `cb732bd`, the head of `feature/model-p3` (23 Oct 2026, "Model P3: re-pin the regression after the
St Inez / Merces fields …"). It is the commit named in the seeded registry author `port:coastal-resilience-studio@cb732bd`.
It was never merged to the old repository's `main` (head `11babd4`): `main..cb732bd` is 22 commits, which is the whole
model-audit series. The port therefore came from the audit branch, not from `main`.

**The three audit branches are ancestors of it** (`git merge-base --is-ancestor <branch> cb732bd` is true for each):

| Branch | Head | Date | Relation to `cb732bd` |
|---|---|---|---|
| `feature/model-p0` | `16a2347` | 2026-10-22 | ancestor (P1 was cut from it) |
| `feature/model-p1` | `7292ffb` | 2026-10-23 | ancestor (P2 rebased onto it) |
| `feature/model-p2` | `3f1379c` | 2026-10-23 | ancestor (P3 cut from it at `3f1379c`) |
| `feature/model-p3` | `cb732bd` | 2026-10-23 | the ported commit |

**Finding by finding, in `packages/core` as ported:**

| Finding | Where it lives in `packages/core/src` |
|---|---|
| M1 tide reference MHHW +0.6 m | `engine/inundation.ts`, `engine/model.ts` (`highTideReferenceM`), `data/hazards.json` |
| M2 seawall, M3 dune as `crest_barrier`; siting rules | `engine/effects.ts` (`crest_barrier`), `engine/types.ts`, `data/caseStudyAreas.json` |
| M4 hazard inputs as ranges | `engine/types.ts`, `engine/model.ts`, `data/hazards.json` |
| M5 return periods (COAST-RP) | `engine/types.ts` |
| M6 SLR + storm, M7 regional SLR, M8 DeltaDTM | tagged in the engine and data files; `DEM_SOURCE` selects DeltaDTM |
| M9 bunds as barriers, three wet classes | `engine/model.ts` |
| M10 overland attenuation | `data/hazards.json` `overlandAttenuationMPerKm` (default 0, range 0–1.0 m/km, Vafeidis et al. 2019 in `data/citations.json`); the only finding carried without an "M10" tag in the source |
| M11 one water level in metres | `engine/model.ts` |
| M12 depth-damage (Huizinga) and SVI, M13 EAD and people per year | `engine/model.ts` |
| M14 ecology card | `engine/model.ts`, `engine/types.ts` |
| M15 rain at high tide, drainage measures, Mala | `engine/rain.ts`, `engine/model.ts`, `engine/types.ts` |
| M16 compound timing check, no cap | `engine/model.ts` |
| M17 mangrove parameters | rated "OK" by the 22 Oct review: no change was required, so nothing to look for |
| M18 metric label | `index.ts` |

**Conclusion.** The fixes were already merged in the ported commit; there is nothing to apply now, and no value changes to
log. The regression pins stand at 241 of 241 unchanged against `cb732bd`. The old → new tables for every value the audit
changed (60 in P0, the P1 and P2 tables, the DeltaDTM switch, the P3 re-pins) remain in `MODEL_AUDIT_LOG_ported.md`.
Still open from the audit, unchanged by the port and recorded there under "Still open after Phase 3": the placeholder
ranges (river stage and λ_F, storm-tide range, bund crests, seawall and dune crests, check-dam and khazan sizes, wave
decay, segment thresholds, overland attenuation), the MSL ≈ EGM2008 tie, and the optional Monte Carlo P10–P90. Each waits
on a source named in spec §7 or on a reviewer's decision in the registry, not on code.
