# Panaji/Mandovi pilot — data inventory (living doc)

Tracks real data assets received/sourced for the Coastal Resilience Studio's Panaji pilot, as a
companion to `COASTAL_DRR_TOOL_BUILD_PROMPT.md`'s Section 4 (case-study area) and Section 5
(grounding-quality tags). Update this doc as more inputs arrive rather than losing the inventory
in chat.

## Pilot boundary — confirmed 2026-09-25

Full Panjim area, explicitly including the sea (Arabian Sea/Aguada Bay to the west) and the
Mandovi river (the channel and its near bank up to Ribandar/Chorão), not just the built-up city.
Working bounding box used for the classification below: lon 73.76–73.90°E, lat 15.45–15.53°N.

## Received from user, 2026-09-25

**`goa_mandovi_4sec_v3.tif`** — georeferenced RGB raster (EPSG:4326, 8746×8748px, ~3.1m/pixel)
matching the official **Coastal Zone Management Plan (CZMP), Goa** — prepared by the National
Centre for Sustainable Coastal Management (NCSCM), MoEF&CC, for Goa's Dept. of Environment &
Climate Change, under the CRZ Notification 2011, mapped 2017–2022, 1:25,000 scale.

**`1.pdf`** — the CZMP legend template (same series, sheet GA1/Canacona shown, legend block used
across the whole series), supplied for legend reference only.

## Classification pass completed, 2026-09-25

Legend swatch colors were sampled directly from the PDF at 300dpi (not eyeballed), then every
pixel in the pilot bounding box was nearest-color-matched against those calibrated anchors, with
near-white/near-grey/high-distance pixels (roads, text, boundary lines, unmapped land) bucketed
as unclassified. Method and full figures also saved as
`panjim_mandovi_case_study.json` (ready to drop into the build spec's `caseStudyAreas.json`
schema) and `panjim_crz_classification.csv`.

| Category | Area (km²) | % of window |
|---|---|---|
| CRZ-IA (mangrove/ecologically sensitive) | 8.402 | 6.28% |
| CRZ-II (urban/built-up) | 3.641 | 2.72% |
| CRZ-III NDZ (0–200m No Development Zone) | 2.732 | 2.04% |
| CRZ-III (200–500m from HTL) | 1.408 | 1.05% |
| CRZ-IVA (territorial waters) | 14.197 | 10.61% |
| CRZ-IVB (tidal water body / river channel) | 21.733 | 16.25% |
| Waterbody (non-CRZ, e.g. ponds/aquaculture cells) | 0.874 | 0.65% |
| Unclassified (land/roads/basemap/text) | 80.778 | 60.39% |
| **Total window** | **133.763** | 100% |

Grounding-quality tag: `reasoned_extrapolation` — derived from an official government map via
automated classification, visually cross-checked, but not manually digitized or field-verified.

**Khazan Land — attempted, lower confidence.** Detected via the hatch line's actual color
signature (~RGB 190,195,95, sampled from the legend swatch's most saturated pixels, since the
fill is a sparse diagonal hatch on white, not a solid color) plus morphological closing to turn
the line pattern into approximate polygons. Estimate: **~4.58 km²**. Visually plausible —
clusters around the mangrove-fringed estuary margins near Ribandar/Taleigao/Morombi, consistent
with real khazan geography — but includes likely false positives (notably along the outer Bardez
dune coast, unrelated to khazan land) and traces polygon *edges* more than clean fills. Tagged
`placeholder_needs_calibration`; needs a manual review pass before being treated as authoritative.

**Bund (prior to 1991) and Sluice Gate (prior to 1991) — not extracted this pass.** Both render in
near-grey/near-black tones essentially indistinguishable from roads, boundary lines, and map text
at simple color-threshold level. Doing this reliably needs either manual point digitization at
full resolution or a dedicated symbol/template-matching pass — flagged as a follow-up, not
attempted with a low-confidence result.

**Per user instruction, 2026-09-25: pre-1991 Bund and Sluice Gate infrastructure is to be treated
as CURRENT in this tool**, not historical/deprecated — carried into `panjim_mandovi_case_study.json`
as an explicit policy note so it isn't lost before that extraction pass happens.

## Still outstanding

High-resolution DEM/LiDAR, current (post-1991) coastal defense inventory, Bund/Sluice Gate point
locations (see above), any WRD/GCZMA hydrological studies specific to Panaji, finer socioeconomic
vulnerability data, and verified extents of the 2019/2021 flood events.
