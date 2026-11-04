"""
Regenerate docs/DATA_INVENTORY.md from the place-pack manifests, so the inventory never drifts from what the loader serves.

  python -I docs/tools/build_data_inventory.py
"""
import io
import json
from pathlib import Path

R = Path(__file__).resolve().parent.parent.parent


def table(m):
    rows = ["| Layer | Kind | Status | Grounding | Level | Admin-only | Source | Replaced by |", "|---|---|---|---|---|---|---|---|"]
    for l in m["layers"]:
        src = l["source"]
        if len(src) > 160:
            src = src[:160] + "…"
        rows.append(f"| `{l['id']}` · {l['title']} | {l['kind']} | **{l['status']}** | {l['grounding']} | {l['level']} | {'yes' if l.get('admin_only') else 'no'} | {src} | {l.get('replaced_by') or '–'} |")
    return "\n".join(rows)


nat = json.load(io.open(R / "data/national/manifest.json", encoding="utf-8"))
pan = json.load(io.open(R / "data/places/panjim/manifest.json", encoding="utf-8"))

events = "\n".join(
    f"| {e['name']} | {e['date']} | {e['hazard']} | {'; '.join(o['kind'] + ' — ' + o['source'] for o in e['observations'])} | **{e['status']}** |"
    for e in pan["calibration_events"]
)
policy = "\n".join(f"| {p['title']} | {p['issuer']} | {p['year'] or '–'} | **{p['status']}** | {p['applicability'].replace('_', ' ')} |" for p in pan["policy_corpus"])

doc = f"""# Data inventory (living document)

_Generated from `data/national/manifest.json` and `data/places/panjim/manifest.json` by `docs/tools/build_data_inventory.py`; edit the manifests, not this file. The old pilot inventory is kept verbatim as `PANAJI_PILOT_DATA_INVENTORY.md`._

Every dataset the studio reads, with source, level, grounding and status. Placeholder and admin-only layers never reach the studio (spec rule 2); the studio draws only layers that are supplied or derived, not placeholders, and not admin-only.

## National base data (`data/national/`, loaded once, reused for any place)

{table(nat)}

## Panjim place pack (`data/places/panjim/`)

{pan['description']}

{table(pan)}

### Calibration events

| Event | Date | Hazard | Observations | Status |
|---|---|---|---|---|
{events}

### Policy corpus

| Instrument | Issuer | Year | Status | Applicability |
|---|---|---|---|---|
{policy}

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
"""
io.open(R / "docs/DATA_INVENTORY.md", "w", encoding="utf-8", newline="\n").write(doc)
print("wrote docs/DATA_INVENTORY.md")
