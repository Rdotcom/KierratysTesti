import { describe, expect, it } from "vitest";
import {
  NetworkImageRequestSchema,
  NetworkObservationSchema,
  NetworkScoreSchema,
  NetworkSuggestionObservationSchema,
  networkConsentVersion,
  objectKinds,
  objectSuggestionsFromScores,
  observationFromScores,
  suggestionObservationFromScores,
} from "../network-recognition";

const scores = objectKinds.map((kind, index) => ({ kind, similarity: 0.2 - index * 0.01 }));
const date = "2026-11-17T12:00:00.000Z";
describe("own-server object contract", () => {
  it("requires explicit versioned consent and rejects URL/extra inputs", () => {
    expect(NetworkImageRequestSchema.safeParse({ jpegBase64: "abcdefgh" }).success).toBe(false);
    expect(
      NetworkImageRequestSchema.safeParse({
        jpegBase64: "abcdefgh",
        consentVersion: networkConsentVersion,
        imageUrl: "https://example.com",
      }).success,
    ).toBe(false);
  });
  it("requires all fifteen ordered unique finite model scores", () => {
    for (const invalid of [
      scores.slice(1),
      [...scores].reverse(),
      scores.map((r) => ({ ...r, similarity: NaN })),
      scores.map((r) => ({ ...r, similarity: 2 })),
    ])
      expect(NetworkScoreSchema.safeParse(invalid).success).toBe(false);
  });
  it("retains uncertainty, server execution and object-only scope", () => {
    const observation = observationFromScores(scores, date);
    expect(observation.candidates).toEqual(["cup", "spoon", "fork"]);
    expect(observation.source).toMatchObject({
      execution: "server",
      confidence: "uncalibrated",
      verification: "unverified",
      scope: "object_form_only",
      observedAt: date,
    });
    expect(NetworkObservationSchema.safeParse({ ...observation, material: "metal" }).success).toBe(
      false,
    );
    expect(
      NetworkObservationSchema.safeParse({
        ...observation,
        source: { ...observation.source, confidence: "high" },
      }).success,
    ).toBe(false);
  });
  it.each(["other", "multiple-cups", "spoon-and-fork"])(
    "does not force a single object for %s",
    (kind) => {
      const result = observationFromScores(
        scores.map((r) => ({ ...r, similarity: r.kind === kind ? 0.9 : 0 })),
        date,
      );
      expect(result.focus).toBe(kind === "other" ? "unknown" : "multiple");
      expect(result.candidates).toEqual([]);
    },
  );
  it("resolves ties using frozen class order and rejects duplicate candidates", () => {
    const result = observationFromScores(
      scores.map((r) => ({ ...r, similarity: 0 })),
      date,
    );
    expect(result.candidates).toEqual(["cup", "spoon", "fork"]);
    expect(
      NetworkObservationSchema.safeParse({ ...result, candidates: ["cup", "cup"] }).success,
    ).toBe(false);
  });
  it("keeps the v1 wire shape while v2 retains a fourth rank and explicit display strategy", () => {
    const input = scores.map((r) => ({ ...r, similarity: r.kind === "spoon" ? 0.35 : 0.1 }));
    const legacy = observationFromScores(input, date);
    const next = suggestionObservationFromScores(input, date);
    expect(legacy.candidates).toEqual(["spoon", "cup", "fork"]);
    expect(legacy).not.toHaveProperty("presentation");
    expect(next.candidates).toEqual(["spoon", "cup", "fork", "knife"]);
    expect(next.presentation).toBe("confirm");
    expect(next.source).toEqual(legacy.source);
    expect(NetworkObservationSchema.safeParse(next).success).toBe(false);
  });
  it.each([
    [0.35, 0.1, "confirm"],
    [0.12, 0.08, "confirm"],
    [0.119, 0.01, "alternatives"],
    [0.35, 0.311, "alternatives"],
    [0.35, 0.35, "alternatives"],
    [0, 0, "alternatives"],
    [-0.1, -0.5, "alternatives"],
  ])("uses scores %s/%s only to choose a display mode", (first, second, expected) => {
    const input = objectKinds.map((kind) => ({
      kind,
      similarity: kind === "spoon" ? first : second,
    }));
    expect(objectSuggestionsFromScores(input).presentation).toBe(expected);
  });
  it("includes other/multiple runner-ups in ambiguity and never forces them into choices", () => {
    for (const kind of ["other", "multiple-cups", "spoon-and-fork"]) {
      const input = objectKinds.map((k) => ({
        kind: k,
        similarity: k === "spoon" ? 0.35 : k === kind ? 0.34 : 0,
      }));
      expect(objectSuggestionsFromScores(input).presentation).toBe("alternatives");
      const unknown = objectSuggestionsFromScores(
        input.map((r) => ({ ...r, similarity: r.kind === kind ? 0.9 : r.similarity })),
      );
      expect(unknown.candidates).toEqual([]);
      expect(unknown.presentation).toBe("alternatives");
    }
    const observation = suggestionObservationFromScores(scores, date);
    expect(
      NetworkSuggestionObservationSchema.safeParse({ ...observation, presentation: "verified" })
        .success,
    ).toBe(false);
    expect(
      NetworkSuggestionObservationSchema.safeParse({ ...observation, candidates: ["cup", "cup"] })
        .success,
    ).toBe(false);
  });
});
