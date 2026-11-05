# Resilience Studio

A hyper-local climate and disaster risk decision tool with an AI orchestration layer ("Meta Mind") that connects specialist models so one model's output becomes the next model's input. Pilot: Panjim, Goa. Owner: Ferdin (OneEarth Foundation).

The build spec is [docs/RESILIENCE_STUDIO_BUILD_SPEC_phase1.md](docs/RESILIENCE_STUDIO_BUILD_SPEC_phase1.md). Five rules govern every line of code: evidence only; high confidence only in the studio; agents orchestrate, models compute; everything traced; local overrides national.

## Layout

```
apps/studio        React + Vite + MapLibre: the studio and the admin side
apps/api           Hono API (Vercel functions): registry, place packs, scenario library, runs, sign-off queue
api/               Vercel function entry that mounts apps/api
packages/core      ported risk engine and Panjim loaders (pure, unit-tested)
packages/contracts model contract schema, validator, Liaison routing rules
packages/meta-mind agent interfaces, deterministic Liaison, stub Meta Mind, run logger
packages/registry  registry schema, resolution order, stale detection, seed
packages/places    place-pack manifests and loader (national base data, Panjim)
data/national      national base data; data/places/panjim: the place pack
docs/              spec, CITATIONS.md, MODEL_CONTRACTS.md, DATA_INVENTORY.md, Gauntlet log, step log
```

## Running

```bash
pnpm install
pnpm dev            # api on :3000, studio on :5173 (proxies /api)
pnpm check          # lint, typecheck, unit tests, build
pnpm --filter @resilience/studio smoke   # headless smoke test after a build
DATABASE_URL=... pnpm --filter @resilience/api db:migrate
```

See docs/DEPLOYMENT.md for the one-time setup (GitHub, Vercel, Neon), environment variables, roles and the review workflow; docs/PHASE1_LOG.md for the step log.

Environment: DATABASE_URL (Neon Postgres with PostGIS, injected by the Vercel-Neon integration) and VITE_ARCGIS_API_KEY (Esri World Imagery basemap; without it the map falls back to an openly licensed basemap and says so).
