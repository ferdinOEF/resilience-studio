"""
Extract Goa's state, district and taluka boundaries from the GADM 4.1 India shapefiles into GeoJSON.

  python -I data/national/tools/extract_gadm_goa.py <folder with gadm41_IND_{1,2,3}.shp>

Source: GADM 4.1 (https://gadm.org, 2022 release), WGS 84. GADM is free for academic and other non-commercial use;
redistribution requires permission, so the extracted Goa files carry the GADM licence note in their properties.
"""
import json
import sys
from pathlib import Path

import shapefile  # pyshp

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "boundaries"
out.mkdir(parents=True, exist_ok=True)
LICENCE = "GADM 4.1, https://gadm.org/license.html: free for academic and non-commercial use; no redistribution without permission"

def extract(level: int, name: str, keep: list[str]):
    r = shapefile.Reader(str(src / f"gadm41_IND_{level}.shp"))
    fields = [f[0] for f in r.fields[1:]]
    feats = []
    for sr in r.iterShapeRecords():
        d = dict(zip(fields, sr.record))
        if d.get("NAME_1") != "Goa":
            continue
        props = {k: d[k] for k in keep if k in d}
        props["source"] = "GADM 4.1"
        props["licence"] = LICENCE
        feats.append({"type": "Feature", "properties": props, "geometry": sr.shape.__geo_interface__})
    fc = {"type": "FeatureCollection", "name": name, "crs_note": "EPSG:4326 (WGS 84)", "features": feats}
    p = out / f"{name}.geojson"
    p.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {len(feats)} features, {p.stat().st_size/1024:.0f} kB")

extract(1, "goa_state", ["GID_1", "NAME_1", "ISO_1", "HASC_1"])
extract(2, "goa_districts", ["GID_2", "NAME_1", "NAME_2", "HASC_2"])
extract(3, "goa_talukas", ["GID_3", "NAME_1", "NAME_2", "NAME_3", "VARNAME_3", "TYPE_3", "HASC_3"])
