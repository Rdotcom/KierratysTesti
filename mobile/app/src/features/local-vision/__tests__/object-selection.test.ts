import { describe, expect, it } from "vitest";
import { selectableObjectCandidates } from "../object-selection";
import {
  normalizeObjectCandidates,
  objectKinds,
  type ObjectPhotoResponse,
} from "../object-candidates";
const result = (): Extract<ObjectPhotoResponse, { status: "observed" }> => ({
  status: "observed",
  observation: normalizeObjectCandidates(
    JSON.stringify({
      schemaVersion: "siglip-object-candidates-v1",
      modelId: "google-siglip2-base224-block32-v1",
      modelRevision: "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
      preprocessing: "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2",
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
      checkedOn: "2026-11-16",
      observedAt: "2026-11-16T18:00:00Z",
      scores: objectKinds.map((kind) => ({ kind, similarity: kind === "spoon" ? 0.3 : 0.1 })),
    }),
  ),
});
describe("object candidate actions", () => {
  it("keeps actual normalized rank order without changing inference or confidence", () => {
    const input = result(),
      before = structuredClone(input);
    expect(selectableObjectCandidates(input)).toEqual(["spoon", "cup", "fork"]);
    expect(input).toEqual(before);
  });
  it.each(["multiple", "unknown"] as const)("does not force choices for %s", (focus) => {
    const input = result();
    input.observation.focus = focus;
    expect(selectableObjectCandidates(input)).toEqual([]);
  });
  it("does not offer choices when inference is unavailable", () => {
    expect(selectableObjectCandidates({ status: "unavailable", reason: "unsupported" })).toEqual(
      [],
    );
  });
  it("deduplicates, bounds and excludes unsupported object forms", () => {
    const input = result();
    input.observation.candidates = [
      "other",
      "spoon",
      "spoon",
      "multiple-cups",
      "fork",
      "knife",
      "cup",
    ];
    expect(selectableObjectCandidates(input)).toEqual(["spoon", "fork", "knife"]);
  });
});
