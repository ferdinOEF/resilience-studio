# Data inventory (living document)

Every dataset the studio reads, with source, level, grounding and status. Companion to the place-pack manifest
(`data/places/panjim/manifest.json`) and the national base data (`data/national/`). The old pilot inventory is kept verbatim
as `PANAJI_PILOT_DATA_INVENTORY.md`.

## National base data (loaded once, reused for any place)

| Layer | Source | Status | Notes |
|---|---|---|---|
| State, district and taluka boundaries | GADM 4.1 (`gadm41_IND_shp.zip`, supplied by Ferdin, 2022-07-19 release) | received 2026-11-04 | Goa extracted to `data/national/boundaries/`; GADM level 3 = talukas (12 in Goa) |
| Cartosat 30 m DEM | ISRO Bhuvan | not yet supplied | national terrain fallback |
| IMD cyclone tracks | IMD / IBTrACS cache in the old repo | carried from old repo cache (not yet ported) | |
| Census 2011 | Census of India (town tables) | carried from old repo (`svi.json`, census towns) | fallback population |
| SOI coastline | Survey of India | not yet supplied | |

## Panjim place pack

See `data/places/panjim/manifest.json` once step 6 lands. Starting contents per spec §4.

## Needed from Ferdin for Phase 1 (spec §7) — status

| # | Item | Status |
|---|---|---|
| 1 | North Goa DDMP 2022 and Goa SDMP 2024, full PDFs | not yet supplied |
| 2 | CSTEP 2024 Panjim sea-level-rise report | not yet supplied |
| 3 | Shetye reference "[to verify]": full citation or PDF | not yet supplied |
| 4 | Observed flood extents / levels, Tauktae 2021 and monsoon 2019 | not yet supplied (calibration events; gate for `signed_off`) |
| 5 | CCP ward boundary shapefile; ward population / household survey | not yet supplied (landmark-derived placeholder zones used, admin-only) |
| 6 | Panaji ODP and CZMP (vector if available) | CZMP raster classification carried from old repo; ODP not yet supplied |
| 7 | Mormugao tide-gauge data (PSMSL/SOI) | not yet supplied |
