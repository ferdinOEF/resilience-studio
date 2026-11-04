# Data inventory (living document)

_Generated from `data/national/manifest.json` and `data/places/panjim/manifest.json` by `docs/tools/build_data_inventory.py`; edit the manifests, not this file. The old pilot inventory is kept verbatim as `PANAJI_PILOT_DATA_INVENTORY.md`._

Every dataset the studio reads, with source, level, grounding and status. Placeholder and admin-only layers never reach the studio (spec rule 2); the studio draws only layers that are supplied or derived, not placeholders, and not admin-only.

## National base data (`data/national/`, loaded once, reused for any place)

| Layer | Kind | Status | Grounding | Level | Admin-only | Source | Replaced by |
|---|---|---|---|---|---|---|---|
| `gadm_goa_state` · State boundary, Goa | boundary | **supplied** | solid_direct | state | no | GADM 4.1 (2022), gadm41_IND_1 filtered to Goa; supplied by Ferdin as gadm41_IND_shp.zip on 2026-11-04 | – |
| `gadm_goa_districts` · District boundaries, Goa (North Goa, South Goa) | boundary | **supplied** | solid_direct | state | no | GADM 4.1 (2022), gadm41_IND_2 filtered to Goa | – |
| `gadm_goa_talukas` · Taluka boundaries, Goa (12) | boundary | **supplied** | solid_direct | state | no | GADM 4.1 (2022), gadm41_IND_3 filtered to Goa; GADM names Tiswadi 'Panaji Taluk', Bardez 'Mapuca Taluk', Salcete 'Madgaon Taluk', Mormugao 'Sambaji Taluk', Satt… | – |
| `datameet_census2001_units` · Census 2001 town and village boundaries, Goa (402 units) | boundary | **supplied** | reasoned_extrapolation | state | no | DataMeet community maps (datameet/maps, CC BY 4.0): Census of India 2001 town/village boundaries; carried from the old repo's cache (2026-10-23) | – |
| `cartosat_dem` · Cartosat-1 30 m DEM (national terrain fallback) | terrain | **not_yet_supplied** | reasoned_extrapolation | national | yes | ISRO Bhuvan CartoDEM v3 R1 (to be downloaded for the tiles a place needs) | – |
| `imd_cyclone_tracks` · IMD cyclone best tracks (Arabian Sea) | vector | **not_yet_supplied** | solid_direct | national | yes | IMD cyclone eAtlas / IBTrACS (the old repo cached IBTrACS under data/cache/ibtracs) | – |
| `census_2011` · Census of India 2011 (town and village tables) | table | **supplied** | solid_direct | national | no | Census of India 2011 Primary Census Abstract; the Panjim units are in packages/core/src/data/svi.json | – |
| `soi_coastline` · Survey of India coastline | vector | **not_yet_supplied** | solid_direct | national | yes | Survey of India | – |

## Panjim place pack (`data/places/panjim/`)

Panjim and the frontage directly touching it on the same bank of the Mandovi (spec section 4). Every layer lists its source, level, grounding and status; placeholder layers are admin-only until replaced. Model parameters live in the science registry, not here.

| Layer | Kind | Status | Grounding | Level | Admin-only | Source | Replaced by |
|---|---|---|---|---|---|---|---|
| `city_boundary` · Panjim city footprint (Census 2001 town boundary) | boundary | **supplied** | reasoned_extrapolation | city | no | DataMeet community maps (CC BY 4.0): Census of India 2001 town boundary of Panaji (CEN_2001 3001000340120000) | CCP municipal boundary (spec section 7, item 5) |
| `tiswadi_towns` · Census 2001 towns of Tiswadi (Panaji, Chimbel, Bambolim, Calapor, Goa Velha) | boundary | **supplied** | reasoned_extrapolation | city | no | DataMeet community maps (CC BY 4.0): Census of India 2001 town boundaries | – |
| `ward_zones` · Ward zones (landmark-derived placeholder, 9 zones) | zones | **placeholder** | placeholder_needs_calibration | city | yes | Voronoi cells of OpenStreetMap place nodes (Nominatim, 2026-11-04: Patto, Fontainhas, Mala, Altinho, St Inez, Campal, Miramar, Caranzalem, Taleigao, Ribandar, M… | CCP ward boundary shapefile (spec section 7, item 5) |
| `landmarks` · Landmark positions used for the zones (OpenStreetMap via Nominatim) | points | **supplied** | reasoned_extrapolation | city | yes | Nominatim search results, 2026-11-04, bounded to the Panjim window; each hit carries its osm_type/osm_id | – |
| `osm_admin_tags` · OpenStreetMap administrative relations in the window (tags only) | table | **supplied** | reasoned_extrapolation | state | yes | Overpass API, 2026-10-23 (old repo cache): Goa, North Goa, Tiswadi, Bardez relations | – |
| `creeks` · Creeks and drains (OpenStreetMap waterways) | vector | **supplied** | reasoned_extrapolation | city | no | Overpass API, 2026-10-23 (old repo cache): waterway ways in the window; used by the rain-at-high-tide catchments | CCP / Imagine Panaji drain network and outfall levels |
| `terrain_deltadtm` · DeltaDTM v1.1 Mandovi tile (default terrain) | terrain | **supplied** | reasoned_extrapolation | city | no | Pronk et al. (2024) DeltaDTM v1.1, 1 arc-second bare-earth coastal DTM (EGM2008), tile supplied by Ferdin (4TU.ResearchData was unreachable); also as terrain/De… | a finer DTM (LiDAR) when available |
| `terrain_glo30` · Copernicus GLO-30 (surface model, above 10 m) | grid | **supplied** | reasoned_extrapolation | national | no | Copernicus DEM GLO-30, tile N15 E073, gridded in packages/core/src/data/panjimDemGrid.json | – |
| `crz_grid` · CRZ classification grid (CZMP Goa), 55 m cells | grid | **supplied** | reasoned_extrapolation | city | no | Goa CZMP (NCSCM, CRZ Notification 2011) raster goa_mandovi_4sec_v3.tif, colour-classified in the old repo (docs/PANAJI_PILOT_DATA_INVENTORY.md); grid in package… | CZMP vector (spec section 7, item 6) |
| `czmp_raster` · CZMP raster (goa_mandovi_4sec_v3.tif, 3.1 m per pixel) | raster | **supplied** | solid_direct | city | yes | Supplied by Ferdin 2026-09-25 (old repo); not committed (size) | – |
| `khazan_polygons` · Khazan polygons (CZMP hatch, vectorised) | vector | **placeholder** | placeholder_needs_calibration | city | yes | CZMP khazan hatch, colour-classified and morphologically closed in the old repo, vectorised from the 55 m grid mask (packages/core/tools/khazan_polygons.ts) | manual review against the CZMP sheets; a khazan tenant-association or WRD layer |
| `field_bunds` · Traced field bunds outside the khazan mask (Patto, Taleigao, St Inez / Merces) | vector | **derived** | reasoned_extrapolation | city | no | Traced in the old repo (Phase 3, A1) from Sentinel-2 cloudless 2016, building footprints and OSM farmland; Ferdin's ground truth that these fields are bunded (2… | a bund survey (crest heights) |
| `existing_defenses` · Sluice-gate candidates and defence notes (CZMP symbology) | points | **placeholder** | placeholder_needs_calibration | city | yes | packages/core/src/data/existingDefenses.json (old repo extraction from the CZMP symbology) | manual digitisation of bund and sluice symbols at full resolution |
| `ddmp_facilities` · Emergency facilities named in the North Goa DDMP 2022 | points | **not_yet_supplied** | placeholder_needs_calibration | city | yes | North Goa District Disaster Management Plan 2022 (named in the spec: GPS Karem, GPS Madel, Altinho MPCS); the PDF has not been supplied, so the facilities are l… | the DDMP PDF (spec section 7, item 1) and geocoding against it |
| `population_census2011` · Population: Census 2011 census-unit totals (fallback) | table | **supplied** | reasoned_extrapolation | city | no | Census of India 2011 PCA, census units Panaji, Taleigao, Bambolim, Chimbel, Calapor… in packages/core/src/data/svi.json; GHS-POP 2020 grid rescaled to these tot… | CCP ward-level population or household survey (spec section 7, item 5) |
| `exposure_buildings` · Building footprints and road surface (OSM + Microsoft) | grid | **supplied** | reasoned_extrapolation | city | no | OpenStreetMap and Microsoft Global ML Building Footprints, gridded in packages/core/src/data/panjimExposureGrid.json | a survey of building classes and floor levels |
| `policy_clause_map` · Policy clause map (instruments × modelled risks) | document | **placeholder** | placeholder_needs_calibration | city | no | Seeded with the six instruments of spec section 7 and the modelled risks; every cell unassessed until the Policy agent and an expert sign-off (later phase) | clause-level assessments signed off by an expert |

### Calibration events

| Event | Date | Hazard | Observations | Status |
|---|---|---|---|---|
| Cyclone Tauktae | 2021-05-16 | surge | observed flood extent or water levels in Panjim — to be supplied (WRD, GSDMA, CCP, dated press photos) | **observations_pending** |
| Monsoon floods 2019 | 2019-07 | rain | observed flood extent or water levels in Panjim — to be supplied (WRD, GSDMA, CCP, dated press photos) | **observations_pending** |

### Policy corpus

| Instrument | Issuer | Year | Status | Applicability |
|---|---|---|---|---|
| Coastal Regulation Zone Notification 2019 and the Goa CZMP | MoEF&CC, Government of India; NCSCM for Goa | 2019 | **public_not_fetched** | to confirm clause by clause |
| Disaster Management Act 2005; Goa State DMP 2024; North Goa DDMP 2022 | Government of India; GSDMA; North Goa District | 2024 | **not_yet_supplied** | to confirm clause by clause |
| Regional Plan for Goa and the Panaji Outline Development Plan | Town and Country Planning Department, Goa; NGPDA | – | **not_yet_supplied** | to confirm clause by clause |
| Goa State Action Plan on Climate Change | Government of Goa | – | **public_not_fetched** | to confirm clause by clause |
| Wetlands (Conservation and Management) Rules 2017 | MoEF&CC, Government of India | 2017 | **public_not_fetched** | to confirm clause by clause |
| National Building Code and local building bye-laws | BIS; Corporation of the City of Panaji | – | **not_yet_supplied** | to confirm clause by clause |

## Needed from Ferdin for Phase 1 (spec §7) — status on 2026-11-05

| # | Item | Status |
|---|---|---|
| 1 | North Goa DDMP 2022 and Goa SDMP 2024, full PDFs | not yet supplied (the three DDMP relief centres are listed without positions) |
| 2 | CSTEP 2024 Panjim sea-level-rise report | not yet supplied (AR6 Mormugao values carried from the old registry at state level) |
| 3 | Shetye reference "[to verify]": full citation or PDF | not yet supplied |
| 4 | Observed flood extents / levels, Tauktae 2021 and monsoon 2019 | not yet supplied; this is the gate for `signed_off` and for anything to appear in the studio |
| 5 | CCP ward boundary shapefile; ward population / household survey | not yet supplied (landmark-derived placeholder zones, admin-only) |
| 6 | Panaji ODP and CZMP (vector if available) | CZMP raster classification carried from the old repo; ODP not yet supplied |
| 7 | Mormugao tide-gauge data (PSMSL/SOI) | not yet supplied |
| – | GADM 4.1 India shapefiles | **supplied 2026-11-04** (Downloads/gadm41_IND_shp.zip), Goa extracted |
