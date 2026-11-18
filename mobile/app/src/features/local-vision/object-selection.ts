import { type SortableObjectKind, sortableObjectKinds } from "@kierratysappi/recycling-engine";
import type { ObjectKind, ObjectPhotoResponse } from "./object-candidates";

export function selectableObjectCandidates(result: ObjectPhotoResponse): SortableObjectKind[] {
  if (result.status !== "observed" || result.observation.focus !== "single") return [];
  return [...new Set(result.observation.candidates)]
    .filter((kind): kind is Extract<ObjectKind, SortableObjectKind> =>
      sortableObjectKinds.some((supported) => supported === kind),
    )
    .slice(0, 4);
}

export function objectCandidateChoices(result: ObjectPhotoResponse, rejected = false) {
  const candidates = selectableObjectCandidates(result);
  const primary =
    result.status === "observed" && result.observation.presentation === "confirm"
      ? candidates[0]
      : undefined;
  return {
    primary: rejected ? undefined : primary,
    alternatives: candidates.filter((kind) => !rejected || kind !== primary).slice(0, 3),
  };
}
