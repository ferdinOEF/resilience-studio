import { describe, expect, it } from "vitest";
import { getLayer, getManifest, inventory, listPlaces, NATIONAL, PANJIM_PACK, studioLayers, tiswadiFootprint } from "../src";

describe("place packs", () => {
  it("validates both manifests and lists them", () => {
    expect(listPlaces().map((p) => p.id)).toEqual(["india", "panjim"]);
    expect(PANJIM_PACK.geography.city).toBe("IN-GA-panjim");
    expect(NATIONAL.level).toBe("national");
  });
  it("serves the committed vector layers with real geometry", () => {
    const talukas = getLayer("india", "gadm_goa_talukas")!;
    expect((talukas.data as { features: unknown[] }).features).toHaveLength(12);
    expect(tiswadiFootprint().features).toHaveLength(1);
    const city = getLayer("panjim", "city_boundary")!;
    expect((city.data as { features: { properties: { NAME: string } }[] }).features[0].properties.NAME).toBe("Panaji");
    const zones = getLayer("panjim", "ward_zones")!;
    expect(zones.layer.admin_only).toBe(true);
    expect((zones.data as { features: unknown[] }).features.length).toBeGreaterThanOrEqual(10);
    expect((getLayer("panjim", "khazan_polygons")!.data as { features: unknown[] }).features.length).toBeGreaterThan(100);
    expect(getLayer("panjim", "nope")).toBeNull();
    expect(getManifest("x")).toBeNull();
  });
  it("keeps placeholder and admin-only layers out of the studio", () => {
    const ids = studioLayers(PANJIM_PACK).map((l) => l.id);
    expect(ids).toContain("city_boundary");
    expect(ids).not.toContain("ward_zones");
    expect(ids).not.toContain("khazan_polygons");
    expect(ids).not.toContain("ddmp_facilities");
    const inv = inventory(PANJIM_PACK);
    expect(inv.find((l) => l.id === "ddmp_facilities")!.status).toBe("not_yet_supplied");
  });
  it("lists the two calibration events with observations pending and the six policy instruments", () => {
    expect(PANJIM_PACK.calibration_events.map((e) => e.status)).toEqual(["observations_pending", "observations_pending"]);
    expect(PANJIM_PACK.policy_corpus).toHaveLength(6);
  });
});
