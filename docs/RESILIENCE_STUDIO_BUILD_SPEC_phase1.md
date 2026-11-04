# Resilience Studio — Build Spec and Phase 1 Step Prompt for Claude Code

*New repository, new GitHub project, new Vercel project. This supersedes `COASTAL_DRR_TOOL_BUILD_PROMPT.md` for the new build; that document and the existing `coastal-resilience-studio` repo remain the reference for everything being ported. Do not modify the old repo. Do not fork it; copy the modules named in Section 6 and nothing else.*

Date: 4 November 2026. Owner: Ferdin (OneEarth Foundation). Pilot: Panjim, Goa.

---

## 0. What Resilience Studio is

A hyper-local climate and disaster risk decision tool with an AI orchestration layer ("Meta Mind") that connects many specialist models so that one model's output becomes the next model's input. For a chosen place it produces one connected outlay: risk, vulnerability, solutions, impacts and consequences, for every scenario from do-nothing to each solution and their combinations, and checks the results against the policies in force to find gaps.

It is **sharp and hyper-local, yet scalable**: it is pointed at one place at a time (Panjim first), but national base data plus the model mesh let it be pointed at any place where base data exists. It is deliberately not a diffuse, planet-scale system.

Five rules govern every line of code:

1. **Evidence only.** Every relationship, formula, parameter, index and threshold traces to a published scientific paper, a UN/GIZ/government report, an official dataset or a documented field survey. No source, no entry.
2. **High confidence only, in the studio.** A user never sees a low-confidence number. A place is either modelled to the studio standard (calibrated, signed off) or it reads "not yet modelled". Confidence is a gate, not a gradient. Grounding tags still exist and are enforced, but on the admin side.
3. **Agents orchestrate; models compute.** No AI component ever produces a physical, social or economic number. The AI layer plans, routes, converts, checks and explains.
4. **Everything traced.** Every run, hand-off, parameter version and sign-off is logged and reconstructible.
5. **Local overrides national.** Every registry entry has a geographic level; the most local applicable entry wins and the studio says which level it used.

## 1. Architecture

### 1.1 Six layers

| Layer | What it holds |
|---|---|
| Place layer | Base data for the geography: terrain, bathymetry, tides, land use, ecology (mangroves, khazans), built assets, people. National base data plus a **place pack** of local overrides per city. |
| Model mesh | The specialist models (coastal, river, cyclone, landslide, fire, ecological, social, economic), each wrapped in a **model contract**. |
| Meta Mind | Three tiers of AI agents (Section 1.3). |
| Solutions layer | Catalogue of interventions expressed as changes to model inputs, with feasibility, cost, time-to-effect, co-benefits and side effects. |
| Policy layer | Clause-level corpus of rules in force at the place; status board (covered / partial / gap / conflict) and deep dive with evidence chain. |
| Science registry (admin) | The editable, versioned, cited store of every relationship, formula, parameter, index and threshold the models and studio use. Section 3. |

### 1.2 The studio (user side) and the admin (inside the studio)

User side, one map-first layout at every scale, with a scale switcher **State → City → Ward**:

- **Risk** — hazard, exposure, vulnerability shown separately and combined; a risk-rating card for the selected place.
- **Scenarios** — hazard, return period, year, pathway; side-by-side A vs B compare with a swipe.
- **Solutions** — catalogue, placement on the map, change-vs-do-nothing, side effects, policy fit.
- **Policy** — status board and clause deep dive; findings marked "awaiting expert sign-off" until approved.

Admin side, same app, role-gated:

- **Registry** — Section 3. This is the science layer and the hyper-local mechanism.
- **Models** — contracts, health, calibration status.
- **Scenario library** — coverage of pre-run scenarios.
- **Runs** — every run as a chain of steps with hand-off details, agent log and audit export.
- **Sign-off queue** — policy findings, registry edits, calibration claims awaiting a human.

The approved UI mockups are the canvas "Resilience Studio — UI mockups" (eight artboards: State, City, Ward risk, Scenarios, Solutions, Policy, Admin, Risk-rating card). Build to them. Felt is the UI standard: one map owns the screen, layers in a left rail, one selected thing in a right card, evidence under every number, no decoration.

### 1.3 Meta Mind: three tiers

| Tier | Role | Allowed to | Never allowed to |
|---|---|---|---|
| **Meta Mind** (one) | Sole decision-maker and accountability holder. Plans the chain for a question, reads all outputs, does the deep cross-model analysis, assembles the outlay, proposes policy gaps and registry edits with reasoning. | Request runs; change scenario parameters **through the framework rules** (every change becomes a logged scenario variant); propose edits and findings for human sign-off. | Produce a number itself; apply a registry edit; publish a policy finding without sign-off. |
| **Liaison Agent** (one or few) | Takes instructions from the Meta Mind. Moves data between models: takes a model's output, does basic checks, decides per the contract routing rules which model(s) it feeds next and whether to combine it with fresh inputs or earlier outputs, and hands it on. Reports back. | Regrid, convert units, align time steps, merge per contract rules; log every hand-off. | Change a parameter; re-route outside the contract rules; silently re-run. |
| **Model Agents** (one per model) | Receive inputs from the Liaison, set up and execute the model run, watch it, troubleshoot, catch bugs, return outputs and run metadata. | Retry a failed run with identical inputs; report anomalies. | Alter inputs; tune parameters. |

In **Phase 1** these are implemented as typed interfaces plus a deterministic Liaison and a stub Meta Mind that records plans and reads results; no LLM calls yet. The run log, audit trail and sign-off queue are built in full now so later phases plug into them.

### 1.4 Compute strategy

Heavy physics models run **ahead of time** into a scenario library (hazard × return period × year × pathway × solution set). The studio explores the library. For what-ifs outside the library, fast stand-in models (emulators trained on library runs, or simpler physics such as SFINCS in place of Delft3D) answer interactively; each result states which it came from. Cheaper models that give comparable results will be tested and preferred where they pass calibration. Model runners live off Vercel on a separate worker (Phase 3); Phase 1 ships the library schema and the ported single-chain engine only.

## 2. Model contract (write this before wiring any model)

A JSON schema in `packages/contracts`. Every model in the mesh has one. Fields:

- `id`, `name`, `version`, `kind` (physical | ecological | social | economic | policy | stand-in)
- `inputs[]` and `outputs[]`: each with `name`, `unit`, `crs`, `grid` (resolution, extent rule), `timestep`, `valid_range`, `required`
- `applicability`: geography level and conditions under which the model is valid
- `routing`: which outputs may feed which model inputs, and the transform required (regrid method, unit conversion, aggregation rule, merge rule such as "max water level")
- `uncertainty`: how uncertainty is expressed and carried (band, ensemble, class)
- `calibration`: events the model has been calibrated against for this place, with metrics and date; `status` ∈ {uncalibrated, calibrated, signed_off}
- `registry_dependencies[]`: registry entry ids the model reads
- `agent`: model-agent configuration (runner, retries, timeouts)
- `grounding`: `solid_direct` | `reasoned_extrapolation` | `placeholder_needs_calibration` — admin-side only

A validator rejects any hand-off whose source output and target input do not match on unit, CRS, grid and range after the declared transform. Build the validator in Phase 1 and test it on the ported chain.

## 3. Science registry (the admin's core)

This replaces the old `registry.db` and `solutions.json` constants as the single store of science. The models, the solutions layer and the studio read from it; nothing numeric lives in code.

### 3.1 Entry schema

Every entry (parameter, relationship, formula, index, threshold, curve):

- `id`, `kind` ∈ {parameter, relationship, formula, index, threshold, curve, dataset_ref}
- `value` (scalar, range, table or expression), `unit`, `valid_range`
- `level` ∈ {global, national, state, city, site} and `geography` (id of the area it applies to)
- `source`: full citation; `source_type` ∈ {peer_reviewed, un_giz_report, government_doc, official_dataset, field_survey, expert_elicitation}; `source_year`; `source_url` or file reference; page or table reference
- `grounding`: the three-tier tag
- `author`, `reviewer`, `status` ∈ {draft, in_review, approved, superseded}, `created_at`, `approved_at`
- `version`, `supersedes` (previous version id), `change_reason`
- `used_by[]`: model ids and solution ids that read it (maintained automatically)

### 3.2 Rules

- **Local overrides national.** Resolution order: site → city → state → national → global. The studio shows the level used beside every number ("city value, CSTEP 2024").
- **Versioned, never overwritten.** An edit creates a new version with a reason; the old one is marked superseded and kept. Scenarios that used a superseded value are flagged **stale** and are hidden from the studio until re-run.
- **Two-person rule.** Author ≠ reviewer. Nothing reaches `approved` without a reviewer.
- **The Meta Mind can propose, never apply.** Proposals enter the sign-off queue with the Meta Mind's reasoning attached.
- **No source, no save.** The form refuses an entry without a citation and source type.
- **Gating.** A model is only `signed_off` when every registry entry it depends on is `approved` and its calibration passes. Only `signed_off` chains can produce results the studio shows. Everything else is admin-only.

### 3.3 Seed

Port every entry from the old registry (Section 6) with its citation and grounding tag intact, assigned to the right `level` (most are `global` or `national`; the CSTEP Panjim SLR entries are `city`; Goa DDMP facilities are `city`). Nothing gets promoted during the port.

## 4. Place pack: `data/places/panjim`

A folder per place, with a manifest that lists every layer, its source, level and status. Panjim's starting contents, ported from the old repo and the pilot data inventory:

- Boundary: Panjim municipal area; ward boundaries (CCP shapefile when supplied; until then the landmark-derived zones from the mockups, marked `placeholder_needs_calibration`, admin-only)
- Terrain: DeltaDTM Mandovi tile (EPSG:32643) as default; Cartosat 30 m as national fallback
- CZMP raster and the CRZ classification areas (`reasoned_extrapolation`)
- Khazan polygons (222, `placeholder_needs_calibration`); pre-1991 bunds and sluices treated as current, per the standing instruction
- Emergency facilities from the North Goa DDMP 2022 (GPS Karem, GPS Madel, Altinho MPCS)
- Population: Census 2011 ward figures as fallback, marked for replacement
- Policy corpus: the six instruments listed in Section 7, as PDFs plus a clause map
- Calibration events: Cyclone Tauktae 2021, monsoon floods 2019 (observed extents/levels to be supplied)

National base data loaded once and reused for any place: state and taluka boundaries (GADM, as used in the mockups), Cartosat DEM, IMD cyclone tracks, Census 2011, SOI coastline. The place pack overrides these where it has better data.

## 5. Stack and repo

- **Monorepo** (pnpm workspaces + Turborepo), TypeScript throughout.
- `apps/studio` — React + Vite, MapLibre GL JS, Esri World Imagery basemap (`VITE_ARCGIS_API_KEY` as before), recharts. Desktop only; no phone layouts.
- `apps/api` — Node (Hono) on Vercel serverless functions: registry CRUD with versioning and review, place-pack manifest, scenario library index, run log, sign-off queue.
- `packages/core` — ported risk engine and loaders (Section 6), pure and unit-tested.
- `packages/contracts` — model contract schema, validator, Liaison routing rules.
- `packages/meta-mind` — agent interfaces, deterministic Liaison, stub Meta Mind, run logger.
- `packages/registry` — registry schema, resolution logic (local-overrides-national), stale-scenario detection.
- `data/national` and `data/places/panjim` — base data and the place pack (large rasters via Git LFS or external object storage; decide and document).
- `docs/` — this spec, `CITATIONS.md`, `DATA_INVENTORY.md`, `MODEL_CONTRACTS.md`, every step prompt and Gauntlet file. Keep it current with each PR.
- **Database:** Postgres with PostGIS (Neon, connected to Vercel). Registry, runs, sign-off queue and place manifests live here. No SQLite.
- **Auth:** minimal role gate for the admin side (admin / scientist / reviewer / viewer). Magic-link or a single provider; keep it small.

## 6. Port list from `coastal-resilience-studio` (copy, don't fork)

Copy these modules into the new packages, apply the model-audit fixes (M1–M18, phases P0–P2 in `STEP_PROMPT_model_audit_and_metrics.md`) during the port, and keep every citation:

- Risk engine: Hazard × Exposure × Vulnerability as separate quantities; the single water-level model in metres with return periods (P1); tide default and crest-barrier handling for seawalls, dunes and bunds (P0/P1); depth-damage (Huizinga) and SVI, EAD and people-per-year (P2); rain-at-high-tide hazard with drainage measures incl. Mala pumping station (P2)
- Registry contents: every parameter with citation and grounding tag → Section 3.3
- Solutions catalogue data and the feasibility × effectiveness structure (IPCC AR6 WG2 CCP2) and the IUCN NbS checklist
- Terrain and layer loaders: DeltaDTM, Cartosat, CZMP raster, khazan vector, CRZ vectorisation (marching squares)
- Sea-level-rise layer logic (IPCC AR6 SSPs; regional AR6 at Mormugao)
- The regression scenario and unit tests; regression values will change where audit fixes apply, and each change is logged old → new

Do **not** port: the old UI, the five-tab/two-mode workspace, the scope veil, anything tied to sql.js.

## 7. Evidence and sources

Build only from sources that can be verified. The existing `CITATIONS.md` list carries over (McIvor et al. 2012; Wahl et al. 2015; Moftakhari et al. 2017; Goda 2010; USACE CEM; d'Angremond et al. 1996; Huynh et al. 2024; Wang et al. 2021; Sasmito et al. 2024; CSTEP 2024; DDMP North Goa 2022; State DMP Goa 2024; Huizinga et al. 2017; IPCC AR6 WG1/WG2). Add nothing without a full reference.

Policy corpus for Panjim (applicability to be confirmed clause by clause): CRZ Notification 2019 and the Goa CZMP; Disaster Management Act 2005, Goa SDMP 2024, North Goa DDMP 2022; Regional Plan for Goa and the Panaji Outline Development Plan; Goa State Action Plan on Climate Change; Wetlands (Conservation and Management) Rules 2017; National Building Code and local bye-laws.

**Needed from Ferdin for Phase 1** (ask; do not substitute):

1. North Goa DDMP 2022 and Goa SDMP 2024, full PDFs
2. CSTEP 2024 Panjim sea-level-rise report
3. The Shetye reference currently marked "[to verify]": full citation or PDF
4. Observed flood extents or water levels for Tauktae 2021 and the 2019 monsoon floods in Panjim (any source: WRD, GSDMA, CCP, press with dated photos)
5. CCP ward boundary shapefile and any ward-level population or household survey
6. Panaji ODP and CZMP (vector if available)
7. Mormugao tide-gauge data (PSMSL/SOI) if a local copy exists

## 8. Phase 1 — what to build in this pass

Build in this order; one branch and one Vercel preview per step; report each preview URL before merging.

1. **Scaffold** the monorepo, CI (lint, typecheck, unit tests, headless smoke test), Neon Postgres with PostGIS, Vercel project, `docs/` with this spec and a fresh `CITATIONS.md`.
2. **Port `packages/core`** per Section 6 with the audit fixes applied; regression test green with the logged value changes.
3. **Registry** (`packages/registry` + API + admin screens): schema, versioning, review workflow, resolution order, stale detection; seed from the old registry. Admin UI: table, entry form with mandatory source, version history, diff, approve/reject.
4. **Model contracts** (`packages/contracts`): schema and validator; write the contracts for the ported chain (water level → damage → people → loss) and prove the validator on it.
5. **Meta Mind skeleton** (`packages/meta-mind`): agent interfaces, deterministic Liaison that executes the ported chain through the contracts, stub Meta Mind that records the plan and result, run log and audit export, sign-off queue.
6. **Place pack `panjim`** with manifest; national base data loader; GADM state/taluka boundaries.
7. **Studio shell** to the mockups: header with breadcrumb and scale switcher; State, City and Ward risk views on real geometry; the risk-rating card; Scenarios, Solutions and Policy views wired to the ported chain and the policy clause map (Policy view may show the board with status from a seeded clause map; the Policy agent comes later). Everything the studio shows must come from a `signed_off` chain; until the ported chain is calibrated against a supplied event, the studio shows Panjim as "not yet modelled" and the full results appear on the admin side only. That is the intended state at the end of Phase 1.
8. **Admin shell** to the Admin mockup: Runs, Models, Scenario library, Registry, Sign-off queue.
9. **Gauntlet loop** on the studio UI against a Felt-standard rubric (map dominance, rail restraint, type, colour, density, evidence visibility), 8-round cap, screenshots logged in `docs/`.

Out of scope in Phase 1: LLM-backed agents, external physics models (SFINCS, SWAN, HEC, Delft3D), the Policy agent, emulators, any place other than Panjim, public sharing, mobile.

## 9. Verify (Phase 1 done when all are true)

- [ ] Every number anywhere resolves to a registry entry with citation, level and version; the studio shows the level used.
- [ ] Editing a registry value creates a version, requires a reviewer, and flags dependent scenarios stale.
- [ ] The contract validator rejects a deliberately mismatched hand-off in a test.
- [ ] The ported chain runs end to end through the Liaison with a complete, exportable audit trail.
- [ ] The studio shows "not yet modelled" for Panjim until the chain is marked `signed_off`; flipping it in admin makes results appear.
- [ ] State, City and Ward views use real boundaries and the scale switcher works both ways.
- [ ] Regression test passes with every value change logged old → new.
- [ ] Deployed on the new Vercel project; each step had a preview URL reported before merge.
- [ ] `docs/` holds this spec, `CITATIONS.md`, `MODEL_CONTRACTS.md`, `DATA_INVENTORY.md` and the Gauntlet log.
