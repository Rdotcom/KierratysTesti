import { sortableObjectKinds, type SortableObjectKind } from "@kierratysappi/recycling-engine";
import type { ObjectKind, ObjectPhotoResponse } from "./object-candidates";

export function selectableObjectCandidates(result: ObjectPhotoResponse): SortableObjectKind[] {
  if (result.status !== "observed" || result.observation.focus !== "single") return [];
  return [...new Set(result.observation.candidates)]
    .filter((kind): kind is Extract<ObjectKind, SortableObjectKind> =>
      sortableObjectKinds.some((supported) => supported === kind),
    )
    .slice(0, 3);
}
