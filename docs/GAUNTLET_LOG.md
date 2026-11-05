# Gauntlet log (studio UI against the Felt-standard rubric)

Spec §8 step 9: a review loop on the studio UI, 8-round cap, screenshots logged here. Each round: screenshot every view at 1440 × 900 (plain studio and, where the gate is open, the admin-preview state), score the six criteria, fix the worst, repeat until no criterion scores below 4 or the cap is reached. Screenshots: `docs/gauntlet/round-N/<view>[-preview].jpg`, taken by `apps/studio/tools/gauntlet.mjs` against a local API in echo mode whose gate was flipped with **test** approvals and a **test** calibration event (nothing real was approved or signed off; the in-memory state was discarded afterwards).

## Rubric (score 1–5 per criterion, per view)

| Criterion | 5 means |
|---|---|
| Map dominance | The map fills the screen between the rails; nothing floats over it except the legend card, zoom buttons and A/B pills; no decorative panels on the map. |
| Rail restraint | The left rail holds controls only (scale, layers, show-as, scenario summary, base-data note); no prose, no charts; at most 5 groups; the right card shows one selected thing. |
| Type | Inter only; 14 px body, 11 px uppercase labels at 0.06em, 18–20 px headline numbers; no more than three sizes on a card; tabular numerals in lists. |
| Colour | Tokens only (docs/DESIGN_TOKENS.md); teal for selection and primary actions; the four-step risk ramp only for risk; warn colours only for placeholders and unsigned results; no gradients, no shadows. |
| Density | Rows 40–48 px; 16 px padding; lists ranked and scannable; no empty cards; a single "Not yet modelled" notice per view, not a banner on every element. |
| Evidence visibility | Every number shows its bound (low · central · high where the run gives them), the level used ("city value") and a grounding chip where it comes from the registry; the legend names the run, calibration state, terrain and basemap; "View evidence chain →" is one click away. |

## Round 1 (2026-11-05, first full build of the views)

| View | Map | Rail | Type | Colour | Density | Evidence | Findings |
|---|---|---|---|---|---|---|---|
| State | 5 | 5 | 4 | 5 | 4 | 4 | Places row said "not yet modelled" twice (chip and value). |
| City | 5 | 5 | 4 | 5 | 3 | 4 | "City-level read" printed the Meta Mind's reference paths as code (`result.totals…`) instead of what they point at. |
| Ward | 5 | 4 | 4 | 5 | 3 | 4 | "Ward boundaries: awaiting the CCP shapefile" repeated three times (map pill, card subtitle, card body). A zone could read "Very high · vulnerability only" while every zone's vulnerability measure was equal (ties were ranked by list order). |
| Scenarios | 5 | 5 | 4 | 5 | 4 | 5 | Header wrapped to two lines with the admin-preview pill present (fixed before the round closed). |
| Solutions | 5 | 3 | 4 | 5 | 3 | 4 | Grounding chips ("placeholder needs calibration") overflowed the 320 px rail; the evidence paragraph is prose in the rail. |
| Policy | – | – | 4 | 5 | 3 | 4 | Matrix clipped: the sixth instrument (building bye-laws) fell outside the main column. |

Fixes applied: references resolved to the run's own values with the path in a tooltip; one status per places row; chips wrap and use short labels (solid · direct / reasoned / placeholder); evidence collapsed behind a disclosure; tied zones share a class and an all-equal measure gives no spread (class 1 everywhere); header brand no-wrap; matrix fits the column (fixed table layout, narrower cells).

## Round 2 (2026-11-05, gate flipped with test approvals)

| View | Map | Rail | Type | Colour | Density | Evidence | Findings |
|---|---|---|---|---|---|---|---|
| State | 5 | 5 | 4 | 5 | 4 | 5 | Teal dot, three bounds on the stat tile, legend names run, terrain, basemap. |
| City | 5 | 5 | 4 | 5 | 4 | 5 | City-level read now reads "flooded area at RP 100, central: 0.632 km²" with the path on hover; registry line "85 entries · level used: 33 city · 3 state · 5 national · 44 global · all approved · run …". |
| Ward | 5 | 4 | 4 | 5 | 4 | 4 | Plain state still repeated the shapefile sentence in the card subtitle. Admin preview not captured (the screenshot tool opened each view in a new tab, and the switch is per-tab). |
| Scenarios | 5 | 5 | 4 | 5 | 4 | 5 | A = nearest signed-off run, B "—" with the reason; chain line "4 of 4 models signed off". |
| Solutions | 5 | 4 | 4 | 5 | 4 | 4 | Rail reads as a catalogue again; values stay "awaiting approval" outside admin preview. |
| Policy | – | – | 4 | 5 | 4 | 4 | All six instruments visible; 36 cells unassessed; evidence chain links the run. |

Fixes applied: card subtitle "Ward scale · Panjim" when no zone is selected; screenshot tool switches admin preview on in each tab.

## Round 3 (2026-11-05, plain and admin preview)

| View | Map | Rail | Type | Colour | Density | Evidence | Findings |
|---|---|---|---|---|---|---|---|
| State | 5 | 5 | 4 | 5 | 4 | 5 | – |
| City | 5 | 5 | 4 | 5 | 4 | 5 | Preview: wards ranked with "unsigned" chip and the method line; two zones with no people in the flood were still "Very high" (server tie-break by area). Fixed in the API: no people in the flood ranks lowest, tied zones share a class. |
| Ward | 5 | 4 | 4 | 5 | 4 | 5 | Preview: Patto card, class 4, rank 1 of 9, three factor bars each labelled "rank among zones", "Calibrated · test event (not a real calibration)", evidence link. |
| Scenarios | 5 | 5 | 4 | 5 | 4 | 5 | – |
| Solutions | 5 | 4 | 4 | 5 | 4 | 4 | Cost and time read "—" (not in the registry); frontage segments are names only until their geometry is supplied. |
| Policy | – | – | 4 | 5 | 4 | 4 | – |

No criterion below 4 after round 3; the loop stops at three of eight rounds. Type stays at 4 everywhere: the mockups' Inter weights are respected, but the legend cards carry four text sizes (title, rows, note, credit) where three would do. Open UI debts that depend on data rather than design: ward geometry (CCP shapefile), relief-centre positions (DDMP), solution cost and time (no registry entries), the exposure and SVI grids as map layers.
