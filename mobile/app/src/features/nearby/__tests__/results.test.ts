import type { CollectionPoint } from "@kierratysappi/contracts/collection-points";
import { describe, expect, it } from "vitest";
import { buildNearbyResults, nearbyMaterialGroups } from "../results";

const position = { latitude: 60.2, longitude: 24.9 };
function point(
  id: number,
  materials: CollectionPoint["reportedMaterials"],
  delta = id / 10000,
): CollectionPoint {
  return {
    id: `node/${id}`,
    coordinates: { latitude: 60.2 + delta, longitude: 24.9 },
    name: null,
    operator: null,
    address: null,
    kind: "container",
    access: "unknown",
    reportedMaterials: materials,
    reportedExclusions: [],
  };
}
describe("material-first nearby results", () => {
  it("separates a closer point with missing materials rather than recommending it", () => {
    const unknown = point(1, [], 0),
      known = point(2, ["smallMetal"]);
    const result = buildNearbyResults([unknown, known], position);
    expect(result.reported.map((r) => r.point.id)).toEqual([known.id]);
    expect(result.missing.map((r) => r.point.id)).toEqual([unknown.id]);
    expect(result.materials.metal.map((r) => r.point.id)).toEqual([known.id]);
    expect(result.materials.plastic).toEqual([]);
    expect(result).not.toHaveProperty("position");
  });
  it("finds nearest five for each material across the directory, not just the first five points", () => {
    const points = [
      ...Array.from({ length: 8 }, (_, i) => point(i + 1, ["glass"])),
      point(20, ["batteries"]),
    ];
    const before = JSON.stringify(points);
    const result = buildNearbyResults(points, position);
    expect(result.reported).toHaveLength(5);
    expect(result.materials.batteries.map((r) => r.point.id)).toEqual(["node/20"]);
    expect(result.materials.glass.map((r) => r.point.id)).toEqual([
      "node/1",
      "node/2",
      "node/3",
      "node/4",
      "node/5",
    ]);
    expect(JSON.stringify(points)).toBe(before);
  });
  it("never infers acceptance from a name and respects exclusions", () => {
    const named = { ...point(1, []), name: "Battery recycling" };
    const conflicting: CollectionPoint = {
      ...point(2, ["batteries"]),
      reportedExclusions: ["batteries"],
    };
    expect(buildNearbyResults([named, conflicting], position).materials.batteries).toEqual([]);
  });
  it("covers every material category and excludes points outside the directory radius", () => {
    for (const [group, values] of Object.entries(nearbyMaterialGroups)) {
      for (const value of values) {
        const result = buildNearbyResults([point(1, [value])], position);
        expect(result.materials[group as keyof typeof nearbyMaterialGroups]).toHaveLength(1);
      }
    }
    expect(buildNearbyResults([point(1, ["metal"], 10)], position).reported).toEqual([]);
  });
});
