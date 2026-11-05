# Phase 1 build log

One branch and one Vercel preview per step (spec §8); the preview URL is recorded here before the merge to main. Branches are stacked in build order (each cut from the previous), so each preview shows everything up to that step.

| Step | Branch | Commit | Preview URL | Merged | Notes |
|---|---|---|---|---|---|
| 1 Scaffold | `step-01-scaffold` | 4062c40 + e7a64eb (handler fix) | https://resilience-studio-git-step-01-scaffold-ferdin-5189s-projects.vercel.app | 2026-11-05 | pnpm + Turborepo, Hono/Neon API, studio shell, CI, vercel.json, docs |
| 2 Port packages/core | `step-02-core-port` | c31b527 | https://resilience-studio-git-step-02-core-port-ferdin-5189s-projects.vercel.app | 2026-11-05 | 241 of 241 pinned regression values unchanged (`REGRESSION_LOG.md`) |
| 3 Registry | `step-03-registry` | 2364309 | https://resilience-studio-git-step-03-registry-ferdin-5189s-projects.vercel.app | 2026-11-05 | 88 seeded entries, all `in_review`; two-person rule; admin screens |
| 4 Model contracts | `step-04-contracts` | 688eed9 | https://resilience-studio-git-step-04-contracts-ferdin-5189s-projects.vercel.app | 2026-11-05 | validator passes the chain, rejects a mismatched hand-off |
| 5 Meta Mind skeleton | `step-05-meta-mind` | 8e64a97 | https://resilience-studio-git-step-05-meta-mind-ferdin-5189s-projects.vercel.app | 2026-11-05 | Liaison reproduces the pinned values; audit export; sign-off queue |
| 6 Place pack panjim | `step-06-place-pack` | ba98dd2, 4b92dce | https://resilience-studio-git-step-06-place-pack-ferdin-5189s-projects.vercel.app | 2026-11-05 | GADM Goa, Census 2001 footprint, placeholder zones (admin-only), khazan polygons, manifest |
| 8 Admin shell | `step-08-admin-shell` | ce7097d | https://resilience-studio-git-step-08-admin-shell-ferdin-5189s-projects.vercel.app | 2026-11-05 | built in parallel with step 7 and committed before it (branch order 6 → 8 → 7) |
| 7 Studio shell | `step-07-studio` | 03bad08 (API), a8aebe9 (views) | https://resilience-studio-git-step-07-studio-ferdin-5189s-projects.vercel.app | 2026-11-05 | State, City, Ward, Scenarios, Solutions, Policy to the mockups; gated on a signed-off chain |

Previews and production are behind Vercel deployment protection (team setting "Vercel Authentication", all except custom domains): open them while signed in to Vercel. The GitHub repository is `ferdinOEF/resilience-studio`; the Vercel project is `resilience-studio` (prj_TSfA6L68ea0KASFPxpTVQGV5yWHW).
| 9 Gauntlet loop | `step-09-gauntlet` | dc2a619 | https://resilience-studio-git-step-09-gauntlet-ferdin-5189s-projects.vercel.app | 2026-11-05 | three rounds, no criterion below 4 (`GAUNTLET_LOG.md`) |

Production: https://resilience-studio.vercel.app (main). Steps 1–6 and 8 were merged first (main at f011f2f, 2026-11-05); steps 7 and 9 followed the same day once their previews were recorded.

## Fixes after Phase 1 (2026-11-05, one branch each, stacked fix-01 → fix-02 → fix-03 → docs)

| Fix | Branch | Commit | Preview URL | Merged | Notes |
|---|---|---|---|---|---|
| 1 Basemap fallback | `fix-01-basemap-2020` | ffce418 | https://resilience-studio-git-fix-01-basemap-2020-ferdin-5189s-projects.vercel.app | 2026-11-05 | EOX `s2cloudless-2016_3857` returns 404 for every tile; now `s2cloudless-2020_3857`, legend and attribution read 2020 |
| 2 Map first paint | `fix-02-map-first-paint` | 888cdec | https://resilience-studio-git-fix-02-map-first-paint-ferdin-5189s-projects.vercel.app | 2026-11-05 | explicit container size before MapLibre init, `map.resize()` on style load and from a ResizeObserver on the map box; `/risk/state` and `/risk/city` drew nothing until the first zoom |
| 3 State-view legend | `fix-03-state-legend` | 17ed78f | https://resilience-studio-git-fix-03-state-legend-ferdin-5189s-projects.vercel.app | 2026-11-05 | compact legend pinned bottom-left: one risk ramp row, one place-status row, the not-modelled explanation on one line |
| Port provenance | `docs-port-provenance` | ba7ee31, 6fb241c | https://resilience-studio-git-docs-port-provenance-ferdin-5189s-projects.vercel.app | 2026-11-05 | `REGRESSION_LOG.md`: the ported commit cb732bd is the head of `feature/model-p3` and carries p0, p1 and p2; M1–M18 already in; nothing to apply |
| ArcGIS key | `env-arcgis-key` | (this commit) | https://resilience-studio-git-env-arcgis-key-ferdin-5189s-projects.vercel.app | 2026-11-05 | `VITE_ARCGIS_API_KEY` added to the Vercel project (production, preview, development) from the local `apps/studio/.env.local`; docs updated; the studio now shows Esri World Imagery |

Checked on the fix-03 preview in a browser without zooming: Sentinel-2 cloudless 2020 tiles and the GADM talukas paint on load; production (old code) stays blank after the same wait. `pnpm --filter @resilience/studio smoke` passes on the stack; `pnpm --filter @resilience/core test` 104 pass, regression pins unchanged.

## Owner-side items (as of 2026-11-05, evening)

Done: the GitHub repository `ferdinOEF/resilience-studio`, the Vercel project, the Neon store (created from the Storage tab and connected; `DATABASE_URL` and the `POSTGRES_*`/`PG*` set injected into all environments), migrations 0001–0003 applied, 88 registry rows seeded (`in_review`), the bootstrap admin signed in on production.

Still open:

1. ~~**`VITE_ARCGIS_API_KEY`**~~ set on 2026-11-05 (evening) in all three environments; the studio shows Esri World Imagery from the next build.
2. **Mail for magic links**: no `MAIL_WEBHOOK_URL`, so production sign-in links are read from the function log.
3. **Sources named in spec §7** (DDMP/SDMP PDFs, CSTEP 2024, Shetye, observed flood extents, CCP wards, ODP/CZMP vector, Mormugao tide gauge): all still to be supplied; tracked in `DATA_INVENTORY.md`. Item 4 (observed extents) is the gate for anything to appear in the studio: no model can be signed off without a calibration event, so the gate stays closed and the studio shows "not yet modelled".

## After the merge of step 9

| Commit | Date | What |
|---|---|---|
| b176d90 | 2026-11-05 | empty commit to redeploy production with the Neon variables |
| ae46c5a | 2026-11-05 | `api/index.ts` hands the body the Vercel runtime pre-reads to Hono; before this every POST with a JSON body on Vercel hung until the 60 s function timeout (GETs and body-less POSTs were unaffected, which is why the earlier previews looked healthy). Verified on the `fix-post-body` preview (400 for a bad address in 2 s), then fast-forwarded to main. |

## Decisions taken without the owner (to confirm)

- Repository location moved from the app's session folder to `C:\Users\ferdi\dev\resilience-studio` (the session folder's path was too long for esbuild/pnpm on Windows).
- Seeded registry entries are `in_review`, author `port:coastal-resilience-studio@cb732bd`; approval is a human act (two-person rule), so nothing was promoted.
- Placeholders without a citation carry `source_type: expert_elicitation` with the model-audit note as their source text; the three press-derived Mala figures likewise (the spec's six source types have no "press" entry).
- The Census 2001 Panaji town boundary (DataMeet) stands in for the CCP municipal boundary; ward zones are nine landmark-derived placeholders (Tonca has no OSM node; Ribandar and Merces fall outside the 2001 town boundary), admin-only.
- Zone "risk class" is a rank among zones by people in the flooded cells, labelled as such; no rating thresholds were invented.
