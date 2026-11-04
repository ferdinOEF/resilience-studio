# STEP_PROMPT — Model audit fixes: one water level, honest ranges, real metrics

Status: ready to implement. Written 22 Oct 2026 after a full read of `src/core/model.ts`, `effects.ts`, `inundation.ts`, `grid.ts` and `src/data/*.json`. I also ran the repo's own functions with one input changed at a time (numbers below). The companion review is `docs/DRR_Tool_Review_and_Model_Audit_2026-10-22.docx`, which lists every finding as M1–M18 with sources.

**This pass changes model outputs on purpose.** `tests/regression.test.ts` pins the current outputs and *will* fail. That's expected. For each phase, update the pinned values in their own commit, with a table in the log of old vs new values and which finding caused each change. Never update a pinned value without that table.

**Guardrails that don't change:**
- Every number keeps a grounding tag and a citation. A new value without a source is `placeholder_needs_calibration`.
- Don't upgrade a tag past the evidence.
- No invented local figures. If a source isn't reachable, keep the placeholder and say so in the log.
- Desktop only.

## Evidence from the current code

| Test (Panjim scope, measures off unless stated) | Now | Change |
|---|---|---|
| Surge extent, tide 0 → +0.6 m | 0.65 km² | 2.11 km² |
| Compound extent, tide 0 → +0.6 m | 2.56 km² | 6.11 km² |
| SLR 2050 central (0.20 m), tide 0 → +0.6 m | 0.00 km² | 0.04 km² |
| Compound, tide +0.6, surge 0.5–2.0 m × stage 0.5–2.0 m | — | 0.68 to 8.35 km² (UI shows ±8%) |
| St Inez transmission H/H0, compound: + seawall | 0.90 | 0.17 (−83%) |
| St Inez, compound: + 200 m mangrove | 0.90 | 0.87 (−3%) |
| St Inez, compound: + dune on a creek bank | 0.90 | 0.59 (allowed, shouldn't be) |

## Phase 0 — wrong answers, small changes (branch `feature/model-p0`)

**P0.1 Tide reference (M1).** Set `highTideReferenceM` to 0.6 m (MHHW above MSL) with range 0.6–1.0 m (spring higher high water). Source: Indian Naval Hydrographic Chart No. 2020 as quoted in Mormugao Port Trust's 2016 capital-dredging ToR. The quoted levels are MSL +1.3 m CD, MHHW +1.9 m CD and spring HHW +2.3 m CD. Tag `reasoned_extrapolation`, with a note that MSL ≈ EGM2008 is assumed and unchecked. Add the citation.

**P0.2 Seawall as a crest barrier (M2).** Replace `reflective_barrier`, which multiplies wave and level by (1 − Kr²), with a new effect kind, `crest_barrier`:
- **Instance params:** `crestM` (m above datum, placeholder) and `frontageShare` (0–1, the share of the segment's shore cells covered; default 1.0).
- **In the extent:** shore cells covered by the barrier don't pass water when WL ≤ crest. Above the crest, pass WL (no reduction). Uncovered frontage and creek mouths still pass water (flanking).
- **In the results:** report "held" or "overtopped" per event.
- **Flags:** keep the reflection coefficient only as a flag for toe scour / beach loss on sandy segments. Add a coastal-squeeze flag where a barrier sits landward of mangrove cells.
- **Citations:** EurOtop 2018 (overtopping manual); keep Goda and USACE CEM for the reflection note.

**P0.3 Dune as a crest barrier (M3).** Same mechanism as P0.2, plus the existing FEMA 540 erosion test: if the cross-section is below the threshold, the dune is removed for the event. Delete `protectionWhenRetained`.

**P0.4 Siting rules (M3).** Add `allowedSettings` to each solution. Add a `setting` to each segment, derived from the CRZ grid and confirmed by hand in `caseStudyAreas.json`. Settings: `sandy_open_coast`, `rocky_coast`, `estuary_bank`, `creek`, `khazan`. Mapping:
- Dune and coastal vegetation: `sandy_open_coast` only.
- Breakwater: open coast only.
- Mangrove: `estuary_bank` and `creek`.
- Khazan polder: where khazan exists.
- Check dam: `creek`.
- Seawall: anywhere, with the flags above.

The UI only offers allowed solutions for the selected segment.

**P0.5 Hazard inputs in the ranges (M4).** Give `referenceSurgeM`, `referenceFloodStageM`, `highTideReferenceM`, `lambdaLevelPerKm` and `lambdaFluvialPerKm` low/central/high values, and use them in the low/high runs, alongside the solution ranges. Starting ranges (all placeholder except the tide):
- Surge: 0.5–2.0 m.
- Stage: 0.5–2.0 m.
- Tide: 0.6–1.0 m.
- λ: 0 to 2× central.

Log a one-at-a-time sensitivity table, and show in the UI which input drives most of the spread.

**P0.6 Name the headline metric (M13).** The headline is bathtub extent. The Results table's "risk" is a hazard-weighted index. Label them so they can't be confused, until Phase 2 replaces the index.

*Accept P0:*
- A seawall no longer reduces transmitted hazard below the share of frontage it doesn't cover.
- A seawall's effect is zero once WL > crest.
- A dune can't be placed on St Inez.
- The displayed range at default settings covers at least the one-at-a-time hazard sweep.
- Every changed regression value is in the log table.

## Phase 1 — one water-level model in metres (branch `feature/model-p1`, from p0)

**P1.1 Single model (M11).** Remove the dimensionless W/L/F index from the decision path. For each water cell:

```
WL = MHHW + SLR(h, ssp) + η_storm(RP) + η_river(x, RP) − Σ mangrove (a·w)
```

Spread WL over connected land. Barriers block water up to their crest. Depth = WL − z.

- **Mangrove:** acts in cm/km directly (McIvor 2012b, 4–48 cm/km). It no longer divides by a reference surge.
- **Storage measures:** subtract volume from the river/rain component.
- **Waves:** become a separate open-coast indicator (run-up / overtopping exposure on Miramar–Caranzalem). They are not added to WL.
- **Segment tables:** keep the "show your work" steps, now in metres.

**P1.2 Return periods (M5).**
- **Storm tide:** take levels for RP 1, 10, 50 and 100 from COAST-RP (Dullaart et al. 2021, 4TU.ResearchData) at the point nearest the Mandovi mouth. Store them in `hazards.json` with the point's ID and coordinates. Tag `reasoned_extrapolation`, since the data is global and model-based.
- **Cross-check:** compare against annual maxima from PSMSL 1249 (Mormugao) if the hourly data is reachable. Log the comparison.
- **River:** use CWC Goa stage records if obtainable. Otherwise use the GloFAS reanalysis return periods for the Mandovi, with the provenance logged. Otherwise keep the placeholder.

**P1.3 SLR on every hazard (M6, M7).**
- SLR becomes a modifier selectable alongside any hazard and return period.
- Replace the global AR6 values with NASA/IPCC AR6 projection-tool values for Mormugao. Keep the global values in Reference.

**P1.4 Terrain (M8).** Build a DeltaDTM v1.1 grid for the scope (Pronk et al. 2024, CC BY 4.0, EGM2008) the same way `build_dem_grid.mjs` builds GLO-30. Use DeltaDTM by default; keep GLO-30 and the Esri TopoBathy check for comparison. Log the mean and RMSE difference per segment.

**P1.5 Bunds and below-tide land (M9).**
- **Bund lines:** draw them as barrier lines with a crest from the existing sluice-gate candidates and the CZMP bund symbology where extractable. Where geometry isn't extractable, use a per-segment "khazan protected by bund" mask with a placeholder crest.
- **Report three classes:** wet at every high tide; behind bunds (floods if a bund fails); newly flooded by this event.
- **Bund failure:** add it as a scenario toggle.

**P1.6 Overland attenuation (M10).** An optional rate in m/km over land. Default 0, range 0–1.0 m/km (Vafeidis et al. 2019). Applies to storm-driven water only, not SLR. Include it in the uncertainty range.

*Accept P1:*
- One water level in metres feeds both map and tables.
- RP and SLR selectors work for every hazard.
- Changing DEM source is a one-line config change with logged differences.
- Bunded khazan is reported in its own class.

## Phase 2 — impact, risk, equity, and Panjim's real flood (branch `feature/model-p2`, from p1)

**P2.1 Exposure layers.**
- **Population:** WorldPop or GHS-POP 100 m, replacing the uniform spread over the hinterland band. Keep the Census 2011 total as a check.
- **Buildings:** Google Open Buildings or OSM footprints.
- **Facilities:** keep critical facilities from ArcGIS Places.

**P2.2 Vulnerability (M12).**
- Remove `susceptibility` and the V = (H/H0)·S definition.
- **Physical:** depth-damage curves per asset class (Huizinga et al. 2017, Asia: residential, commercial, agriculture, roads), with maximum damage values adjusted to India per that report's method. Tag the result.
- **Social:** a social vulnerability index per ward/village from Census 2011 tables. Pick the indicators, write down why each one, and tag the index `reasoned_extrapolation`.

**P2.3 Metric chain (M13).**
- **Hazard:** depth, extent in hectares, annual chance.
- **Exposure:** people, buildings, facilities, land by CRZ class.
- **Impact:** damage in ₹, people affected (depth > 0.15 m, editable, tagged), facilities wet.
- **Risk:** expected annual damage (trapezoid over RP 1/10/50/100) and expected people affected per year.
- **Benefit of a measure:** EAD baseline − EAD with the measure. Also show impacts grouped by SVI class.

**P2.4 Ecology metrics (M14).**
- Stop counting flooded mangrove as land at risk. Add mangrove squeeze: mangrove area with no landward space under each SLR scenario, worse where a barrier or road blocks migration.
- Replace "khazan flooded" with bund overtopping and bund failure exposure.
- Show both on a separate ecology card, not added to damage.

**P2.5 Rain at high tide (M15).** A new hazard, "Heavy rain at high tide".
- **Catchments:** delineate creek catchments in scope from the DEM (Ourem, St Inez, and central Panjim draining from Altinho), as a simple flow-direction pass.
- **Volume balance:** rainfall depth × catchment area × runoff coefficient, minus outfall discharge while the tide is below the outfall level. While the tide is above it, the outfall is closed and water fills the lowest connected cells.
- **Rainfall:** IMD return-period values for Panjim if obtainable, otherwise placeholder.
- **New measures:** retention basin (volume), pumping station (m³/s), creek desilting/widening (capacity), flap/sluice gate (prevents backflow), and mangrove-lined creek (capacity plus habitat).
- **Mala:** add the Mala pumping station and Mala lake retention as an existing measure, tagged from press sources until design figures are found.
- **Calibration note:** Gomantak Times (22 Jun 2023) reports about 15–20 rain-at-high-tide days per monsoon. Use that as a sanity check, not as calibration.

**P2.6 Compound check (M16).**
- Before keeping cyclone + river flood as the default compound case, check IMD cyclone dates against monsoon river peaks. Log the result.
- Remove `compoundCap`. Compound levels come from the components in metres.

*Accept P2:*
- EAD and people per year show for baseline and for each measure.
- Damage can be grouped by SVI class.
- Rain at high tide floods the known hotspots (18 June Road, Patto, the bus stand area), and you've checked that against the map, not the code.
- The ecology card is separate from damage.

## Process

- **Branches and previews:** each phase gets its own branch, cut from the previous one. Report the preview URL and don't merge until Ferdin checks it.
- **Log:** `docs/model-audit/LOG.md`. For each phase: what changed, regression old-vs-new table, sensitivity table, sources fetched (with URLs and access dates), and anything left as a placeholder and why.
- **Tests:** keep `npm test` and `npm run smoke` green. Add unit tests:
  - A barrier holds below its crest and overtops above it.
  - Siting rules reject a dune on a creek.
  - SLR stacks on a storm tide.
  - EAD is computed correctly against a hand-worked example.
  - Rain at high tide stores water while the outfall is closed.
- **UI:** this pass changes what the numbers are, not the design. Update labels, units and the Reference/Methodology text to match. Hold the full W1–W11 UI brief (`GAUNTLET_LOOP_ui_ux_carto_tnc.md`, amended version) until this lands.
- **Report back:** for each phase, give the preview URL, the regression and sensitivity tables, and the list of placeholders still open.

## Verify

- [ ] P0: seawall is a crest barrier; dune is a crest barrier with the FEMA 540 test; siting rules enforced; hazard inputs in the range; tide default +0.6 m with a source.
- [ ] P1: one water-level model in metres; RP 1/10/50/100; SLR on every hazard, regional for Mormugao; DeltaDTM default; bunds as barriers with three wet classes; optional attenuation.
- [ ] P2: depth-damage + SVI; EAD and people/yr; measure benefit; ecology card (squeeze, bund failure); rain-at-high-tide hazard with drainage measures including Mala.
- [ ] Every changed regression value explained; every new number tagged and cited.
- [ ] Each phase on its own branch, preview reported, not merged without Ferdin's check.
