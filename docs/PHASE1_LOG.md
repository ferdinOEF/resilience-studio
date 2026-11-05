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
| 7 Studio shell | `step-07-studio` | 03bad08 (API), UI pending | https://resilience-studio-git-step-07-studio-ferdin-5189s-projects.vercel.app | no | |

Previews and production are behind Vercel deployment protection (team setting "Vercel Authentication", all except custom domains): open them while signed in to Vercel. The GitHub repository is `ferdinOEF/resilience-studio`; the Vercel project is `resilience-studio` (prj_TSfA6L68ea0KASFPxpTVQGV5yWHW).
| 9 Gauntlet loop | `step-09-gauntlet` | — | — | — | |

## Blockers on the owner's side (as of 2026-11-05)

1. **GitHub repository** `ferdinOEF/resilience-studio` does not exist yet and cannot be created from this machine (no GitHub CLI, no signed-in browser session, and the assistant may not use stored credentials). Until it exists there are no previews and no merges.
2. **Neon Postgres**: the Marketplace integration is installed on the Vercel team; the database is created from the Vercel project's Storage tab once the project exists.
3. **Environment variables**: `AUTH_SECRET`, `ADMIN_EMAIL`, `VITE_ARCGIS_API_KEY` (see `DEPLOYMENT.md`).
4. **Sources named in spec §7** (DDMP/SDMP PDFs, CSTEP 2024, Shetye, observed flood extents, CCP wards, ODP/CZMP vector, Mormugao tide gauge): all still to be supplied; tracked in `DATA_INVENTORY.md`. Item 4 (observed extents) is the gate for anything to appear in the studio.

## Decisions taken without the owner (to confirm)

- Repository location moved from the app's session folder to `C:\Users\ferdi\dev\resilience-studio` (the session folder's path was too long for esbuild/pnpm on Windows).
- Seeded registry entries are `in_review`, author `port:coastal-resilience-studio@cb732bd`; approval is a human act (two-person rule), so nothing was promoted.
- Placeholders without a citation carry `source_type: expert_elicitation` with the model-audit note as their source text; the three press-derived Mala figures likewise (the spec's six source types have no "press" entry).
- The Census 2001 Panaji town boundary (DataMeet) stands in for the CCP municipal boundary; ward zones are nine landmark-derived placeholders (Tonca has no OSM node; Ribandar and Merces fall outside the 2001 town boundary), admin-only.
- Zone "risk class" is a rank among zones by people in the flooded cells, labelled as such; no rating thresholds were invented.
