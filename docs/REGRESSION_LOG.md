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
