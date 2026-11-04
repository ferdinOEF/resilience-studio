"""
Landmark-derived ward zones (spec section 4): until the CCP ward shapefile arrives, the city is split into zones by the
nearest landmark (Voronoi cells of the named localities in the mockups), clipped to the Census 2001 Panaji town boundary.
Landmark positions are OpenStreetMap place nodes (Nominatim, 2026-11-04). placeholder_needs_calibration, admin-only.

  python -I data/places/panjim/tools/ward_zones_from_landmarks.py <nominatim_landmarks.json>
"""
import json, sys
from pathlib import Path
from shapely.geometry import shape, Point, MultiPoint, mapping
from shapely.ops import voronoi_diagram

here = Path(__file__).resolve().parent.parent
nom = json.load(open(sys.argv[1], encoding="utf-8"))
city = shape(json.load(open(here / "boundaries" / "panjim_city_census2001.geojson", encoding="utf-8"))["features"][0]["geometry"])

# the mockups' zones; Tonca has no OpenStreetMap place node and is left out until a source names its position
zones = [
    ("patto", "Patto"), ("fontainhas", "Fontainhas"), ("mala", "Mala"), ("altinho", "Altinho"), ("st_inez", "St Inez"), ("campal", "Campal"),
    ("miramar", "Miramar"), ("caranzalem", "Caranzalem"), ("taleigao", "Taleigao fields"), ("ribandar", "Ribandar edge"), ("merces", "Merces edge")
]
pts, props = [], []
for key, label in zones:
    res = [r for r in nom[key]["results"] if r.get("osm_type") == "node" and r.get("type") in ("suburb", "neighbourhood", "quarter", "village", "locality", "hamlet")]
    if not res:
        print("no place node for", key); continue
    r = res[0]
    pts.append(Point(float(r["lon"]), float(r["lat"])))
    props.append({"id": key, "name": label, "landmark": {"osm": f"{r['osm_type']}/{r['osm_id']}", "lon": float(r["lon"]), "lat": float(r["lat"]), "osm_place": r["type"]}})
env = city.buffer(0.05).envelope
cells = voronoi_diagram(MultiPoint(pts), envelope=env)
features = []
for geom in cells.geoms:
    k = next(i for i, p in enumerate(pts) if geom.contains(p))
    clipped = geom.intersection(city)
    if clipped.is_empty:
        print("zone outside the city boundary:", props[k]["id"]); continue
    features.append({"type": "Feature", "properties": {**props[k], "grounding": "placeholder_needs_calibration", "admin_only": True, "area_km2": round(clipped.area * 111.32 * 107.5, 3), "source": "Voronoi cell of the landmark, clipped to the Census 2001 Panaji town boundary (DataMeet); to be replaced by the CCP ward shapefile"}, "geometry": mapping(clipped)})
out = {"type": "FeatureCollection", "name": "ward_zones_landmark_derived", "crs_note": "EPSG:4326", "note": "Placeholder zones from landmark positions (spec section 4). Not wards. Admin-only until the CCP ward shapefile is supplied.", "features": features}
(here / "boundaries" / "ward_zones_landmark.geojson").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print("zones:", len(features), [f["properties"]["name"] for f in features])
