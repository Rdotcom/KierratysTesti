import {
  type CollectionMaterial,
  type CollectionPoint,
  type NearbyCollectionPoint,
  nearestCollectionPoints,
} from "@kierratysappi/contracts/collection-points";
import type { Coordinates } from "@kierratysappi/domain";

export const nearbyMaterialGroups = {
  plastic: ["plastic", "plasticPackaging", "plasticBottles"],
  glass: ["glass", "glassBottles"],
  metal: ["metal", "metalPackaging", "smallMetal", "scrapMetal", "cans", "aluminium"],
  cardboard: ["cardboard", "cartons", "beverageCartons", "paperPackaging"],
  paper: ["paper"],
  batteries: ["batteries", "carBatteries"],
  electronics: ["electricalAppliances", "smallElectricalAppliances"],
  textiles: ["textiles", "clothes", "shoes"],
  other: [
    "wood",
    "gardenWaste",
    "foodWaste",
    "hazardousWaste",
    "fluorescentTubes",
    "lightBulbs",
    "tyres",
  ],
} as const satisfies Record<string, readonly CollectionMaterial[]>;
export type NearbyMaterialGroup = keyof typeof nearbyMaterialGroups;
export type NearbyFilter = "all" | NearbyMaterialGroup;
export type NearbyResults = {
  readonly reported: readonly NearbyCollectionPoint[];
  readonly missing: readonly NearbyCollectionPoint[];
  readonly materials: Readonly<Record<NearbyMaterialGroup, readonly NearbyCollectionPoint[]>>;
};
/** Reuse distances, not raw device coordinates, when changing a filter. No inferred acceptance. */
export function buildNearbyResults(
  points: readonly CollectionPoint[],
  position: Coordinates,
): NearbyResults {
  const reported = points.filter((point) => point.reportedMaterials.length > 0);
  const materials = Object.fromEntries(
    Object.entries(nearbyMaterialGroups).map(([key, values]) => [
      key,
      nearestCollectionPoints(
        reported.filter((point) =>
          point.reportedMaterials.some(
            (m) =>
              (values as readonly CollectionMaterial[]).includes(m) &&
              !point.reportedExclusions.includes(m),
          ),
        ),
        position,
      ),
    ]),
  ) as Record<NearbyMaterialGroup, readonly NearbyCollectionPoint[]>;
  return {
    reported: nearestCollectionPoints(reported, position),
    missing: nearestCollectionPoints(
      points.filter((point) => point.reportedMaterials.length === 0),
      position,
    ),
    materials,
  };
}
