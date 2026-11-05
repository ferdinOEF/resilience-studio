# Handoff: Resilience Studio (Panjim pilot), state on 2026-11-05

You are continuing work on Resilience Studio, a pnpm + Turborepo monorepo built to `docs/RESILIENCE_STUDIO_BUILD_SPEC_phase1.md`. Phase 1 (spec §8, nine steps) is complete and deployed. Read this file, then `docs/PHASE1_LOG.md`, `docs/DEPLOYMENT.md` and `docs/DATA_INVENTORY.md` before changing anything.

## Where things are

- Repo: `C:\Users\ferdi\dev\resilience-studio` (main checkout is on branch `step-09-gauntlet`; use it for building and tests because it has `node_modules` and the built `dist` folders). A second worktree `C:\Users\ferdi\dev\rs-fix` tracks `main` for merges and small fixes. Remote: `https://github.com/ferdinOEF/resilience-studio.git`. Main is at `5e210d3`.
- Do not modify the old repo `C:\Users\ferdi\OneDrive\Ferdin\Earth Foundation\Projects\POG\DRR Tool` (coastal-resilience-studio, ported at cb732bd). Copy modules from it only when the spec names them.
- Vercel: team `team_GeVpELeT0ptwyYLvnkuPnjjF`, project `resilience-studio` (`prj_TSfA6L68ea0KASFPxpTVQGV5yWHW`). Production `https://resilience-studio.vercel.app`; branch previews at `resilience-studio-git-<branch>-ferdin-5189s-projects.vercel.app`. All deployments sit behind Vercel Authentication: reach them from scripts with a `get_access_to_vercel_url` share link and a curl cookie jar.
- Neon: store `store_RJVholriCzdKVALk` (Postgres 18.6, PostGIS 3.6.4), connected through the Vercel Marketplace integration. `DATABASE_URL` and the `POSTGRES_*`/`PG*` set exist in all environments. Migrations 0001–0003 are applied; the registry holds 88 seeded rows, all `in_review`, author `port:coastal-resilience-studio@cb732bd`.
- Auth: magic links signed with `AUTH_SECRET`; bootstrap admin `ADMIN_EMAIL=ferdin@oneearth.world`. Previews have `AUTH_DEV_ECHO=1` and return the link in the response. Production has no mail provider, so the link is only in the function log (Vercel runtime logs, filter "magic link", hobby plan keeps one hour).
- Admin database endpoints (admin session required): `GET /api/admin/db/status`, `POST /api/admin/db/migrate`, `POST /api/admin/db/seed`. The very first migration on an empty database must run from a shell (`pnpm --filter @resilience/api db:migrate` then `db:seed` with `DATABASE_URL` set) because sign-in needs the `users` table.
- Toolchain: node 24 locally (Vercel pinned to `22.x`), pnpm 10, python 3.14, git with GCM. No `gh` CLI, Vercel CLI not logged in. Full check: `pnpm check` (lint, typecheck, test, build). Studio smoke: `apps/studio/tools/smoke.mjs`; gauntlet screenshots: `apps/studio/tools/gauntlet.mjs`.

## Rules that must not be broken

1. No number without a registry entry and a citation.
2. Nothing appears in the studio unless its model chain is `signed_off` (gate: `GET /api/runs/studio/panjim`).
3. No AI component produces a number. The Meta Mind plans, reads and requests variants; the deterministic liaison runs the engines.
4. Every parameter change is a logged scenario variant.
5. If a source or dataset is missing, stop and ask Ferdin for it by name. Never invent a value, never promote a grounding tag, never approve or sign off anything yourself (two-person rule; approval is a human act).

## Known gotchas

- Vercel function entry is `api/index.ts` with `@hono/node-server/vercel`; `vercel.json` rewrites `/api/(.*)` to it. The Node runtime pre-reads request bodies, so the entry passes `req.body` to Hono as `rawBody`. Do not revert either of these (the edge handler hangs, and without `rawBody` every JSON POST hangs 60 s).
- Long paths break esbuild on Windows: keep the repo at `C:\Users\ferdi\dev\...`.
- Large bash heredocs fail in this environment; write files with the Write tool or small python patch scripts.
- The permission classifier blocks a shell command that embeds a credential literal. Put secrets in a scratch file with the Write tool and read them with `head -1`. Never print `DATABASE_URL` or `VITE_ARCGIS_API_KEY`.
- Ferdin wants no permission prompts (he added allow rules in `~/.claude/settings.json`; only deletions ask). Do not edit that file yourself.

## Open items (owner side, ask by name, do not substitute)

1. `VITE_ARCGIS_API_KEY` in Vercel (value is in the old repo's `.env.local`; copy the file, never print it). Until set, the studio shows the Sentinel-2 cloudless fallback and says so.
2. `MAIL_WEBHOOK_URL` so production magic links are mailed.
3. Spec §7 sources: DDMP 2022 and SDMP 2024 PDFs, CSTEP 2024, the Shetye reference, observed flood extents (Tauktae 2021, 2019 monsoon), the CCP ward shapefile, the Panaji ODP/CZMP vector, the Mormugao tide gauge record. The observed extents are the gate: without a real calibration event no model can be signed off and the studio keeps saying "not yet modelled".
4. Ward geometry is nine landmark-derived placeholder zones (admin-only) until the CCP shapefile arrives. Relief-centre positions, solution cost and time, and the exposure and SVI map layers also wait on data.

## Suggested next work (only when Ferdin asks)

- When a §7 source arrives: add it to `data/places/panjim/` with a manifest entry, regenerate `docs/DATA_INVENTORY.md` (`docs/tools/build_data_inventory.py`) and `docs/CITATIONS.md` (`packages/core/tools/build_citations_md.py`), create registry entries as `in_review`, and leave approval to the reviewers.
- When observed flood extents arrive: record a calibration event through the sign-off queue; the chain can then be signed off by a second person and the studio gate opens.
- Keep one branch per piece of work, record the preview URL in `docs/PHASE1_LOG.md`, then fast-forward `main`.
