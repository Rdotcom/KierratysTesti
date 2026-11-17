import { describe, expect, it } from "vitest";
import {
  NetworkImageRequestSchema,
  NetworkObservationSchema,
  NetworkScoreSchema,
  objectKinds,
  observationFromScores,
  networkConsentVersion,
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
});
