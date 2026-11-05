# Deployment and bootstrap

One Vercel project serves the studio (static Vite build from `apps/studio/dist`) and the API (one Node function, `api/[[...route]].ts`, which mounts `apps/api`). Postgres with PostGIS is Neon, attached through the Vercel Marketplace integration that already exists on the team.

## One-time setup (owner actions)

1. **GitHub repository** `ferdinOEF/resilience-studio` (private). The local repository is `C:\Users\ferdi\dev\resilience-studio`; after the remote exists:
   ```bash
   git remote add origin https://github.com/ferdinOEF/resilience-studio.git
   git push -u origin main
   git push origin step-01-scaffold step-02-core-port step-03-registry step-04-contracts step-05-meta-mind step-06-place-pack step-08-admin-shell step-07-studio
   ```
2. **Vercel project** linked to that repository (root directory `.`, framework none; `vercel.json` sets install, build, output and the function). Every pushed branch gets a preview URL; `main` is production.
3. **Neon Postgres** on the Vercel project: Storage → Create → Neon (the Marketplace installation `neon`, free plan). It injects `DATABASE_URL` into every environment. PostGIS is enabled by the first migration.
4. **Environment variables** (Vercel → Settings → Environment Variables):
   | Variable | Where | Purpose |
   |---|---|---|
   | `DATABASE_URL` | all (injected by Neon) | Postgres connection string |
   | `AUTH_SECRET` | all | signs sessions and magic links (any 32+ random characters) |
   | `ADMIN_EMAIL` | all | bootstrap admin (`ferdin@oneearth.world`): created on the first sign-in request |
   | `VITE_ARCGIS_API_KEY` | all | Esri World Imagery basemap; without it the studio uses Sentinel-2 cloudless (EOX) and says so |
   | `AUTH_DEV_ECHO` | preview only, `1` | returns the magic link in the response (no mail provider yet); never in production |
   | `MAIL_WEBHOOK_URL` | optional | POST `{to, subject, text}` to send magic links by mail |
   | `AUTH_USERS` | local dev only | `email:role,…` in-memory users when there is no database |
5. **Migrate and seed** once `DATABASE_URL` exists (locally, with the value pasted into the shell, or from a Vercel CLI session):
   ```bash
   DATABASE_URL=... pnpm --filter @resilience/api db:migrate
   DATABASE_URL=... pnpm --filter @resilience/api db:seed
   ```
   The seed inserts the 88 registry entries from the ported data files as `in_review` with the port as author. Nothing is approved by the seed.

## Roles and the review workflow

| Role | Can |
|---|---|
| viewer | read the admin side |
| scientist | propose registry entries and versions, request runs, propose sign-off items |
| reviewer | approve / reject registry entries (never their own), set model calibration status, decide sign-off items |
| admin | everything, plus invite users (`POST /api/auth/users`) |

The two-person rule is enforced in code: an author cannot approve their own version; a proposer cannot decide their own sign-off item.

## What makes results appear in the studio

A run is shown only when every model in its chain is `signed_off` and the run is not stale. `signed_off` requires (a) every registry entry the model reads to be `approved`, and (b) a calibration event recorded (name, date, metrics) and the status set by a reviewer. Until the observed extents for Tauktae 2021 or the 2019 monsoon floods are supplied and the chain calibrated against them, Panjim reads "not yet modelled" and results live on the admin side only. That is the intended end state of Phase 1.

## Local development

```bash
pnpm install
pnpm --filter @resilience/api build && PORT=3100 AUTH_DEV_ECHO=1 AUTH_USERS="ferdin@oneearth.world:admin,reviewer@example.org:reviewer" pnpm --filter @resilience/api exec tsx src/dev.ts
API_PROXY=http://localhost:3100 pnpm --filter @resilience/studio dev
```
Without `DATABASE_URL` the API runs on an in-memory registry seeded from the data files; writes work locally and are lost on restart; on Vercel without a database the API is read-only and says so.
