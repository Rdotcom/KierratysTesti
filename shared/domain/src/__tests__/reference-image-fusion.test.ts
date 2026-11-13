import { describe, expect, it } from "vitest";
import { fuseReferenceIdentityEvidence } from "../reference-image-fusion";

type Lane =
  | { status: "candidate"; productId: string }
  | { status: "ambiguous"; productIds: string[] }
  | { status: "unknown" | "unavailable" };
const candidate = (productId = "a"): Lane => ({ status: "candidate", productId });
const unknown: Lane = { status: "unknown" },
  unavailable: Lane = { status: "unavailable" };
const fixture = (pixel: Lane = candidate(), embedding: Lane = candidate()) => ({
  pixelImageSha256: "a".repeat(64),
  embeddingImageSha256: "a".repeat(64),
  pixel,
  embedding,
  enrolledProductIds: ["a", "b", "c"],
  quarantineGroups: [] as string[][],
});
const run = (value = fixture()) => fuseReferenceIdentityEvidence(JSON.stringify(value));
describe("registered experimental pixel-veto hybrid", () => {
  it("retains inferred metadata and agreement without bin/probability claims", () => {
    expect(run()).toEqual({
      algorithmVersion: "reference-embedding-pixel-veto-v1",
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
      integrationAllowed: false,
      status: "candidate",
      productId: "a",
      reason: "agreement",
    });
  });
  it("allows gated embedding recovery from pure geometric abstention", () => {
    expect(run(fixture(unknown, candidate()))).toMatchObject({
      status: "candidate",
      productId: "a",
      reason: "embedding_recovery",
    });
  });
  it("never recovers weak embeddings from pixel-only candidates", () => {
    expect(run(fixture(candidate(), unknown))).toMatchObject({ status: "unknown" });
    expect(run(fixture(unknown, unknown))).toMatchObject({ status: "unknown" });
  });
  it("refuses disagreement and never chooses one lane's winner", () => {
    expect(run(fixture(candidate(), candidate("b")))).toMatchObject({
      status: "ambiguous",
      productIds: ["a", "b"],
    });
  });
  it("quarantines even agreement or recovery in a known-confusable family", () => {
    for (const pixel of [unknown, candidate()]) {
      const value = fixture(pixel);
      value.quarantineGroups = [["a", "b"]];
      expect(run(value)).toMatchObject({ status: "ambiguous", productIds: ["a", "b"] });
    }
  });
  it("does not relax ambiguity when the other lane is unknown or agrees with one possibility", () => {
    for (const embedding of [unknown, candidate()])
      expect(
        run(fixture({ status: "ambiguous", productIds: ["a", "b"] }, embedding)),
      ).toMatchObject({ status: "ambiguous", productIds: ["a", "b"] });
  });
  it("unions conflicts with complete quarantine membership", () => {
    const value = fixture(candidate("c"), candidate());
    value.quarantineGroups = [["a", "b"]];
    expect(run(value)).toMatchObject({ status: "ambiguous", productIds: ["a", "b", "c"] });
  });
  it("never treats an operational failure as unknown or recoverable identity", () => {
    for (const value of [
      fixture(unavailable),
      fixture(candidate(), unavailable),
      fixture(unavailable, unknown),
    ])
      expect(run(value)).toMatchObject({ status: "unavailable", reason: "required_lane_failed" });
  });
  it("rejects different query bytes rather than fusing unrelated pictures", () => {
    const value = fixture();
    value.embeddingImageSha256 = "b".repeat(64);
    expect(run(value).status).toBe("invalid");
  });
  it("rejects unlisted products, duplicate ambiguity and malformed quarantine graphs", () => {
    for (const edit of [
      (v: ReturnType<typeof fixture>) => {
        v.embedding = candidate("outside");
      },
      (v: ReturnType<typeof fixture>) => {
        v.pixel = { status: "ambiguous", productIds: ["a", "a"] };
      },
      (v: ReturnType<typeof fixture>) => {
        v.quarantineGroups = [["a", "a"]];
      },
      (v: ReturnType<typeof fixture>) => {
        v.quarantineGroups = [["a", "outside"]];
      },
      (v: ReturnType<typeof fixture>) => {
        v.quarantineGroups = [
          ["a", "b"],
          ["b", "c"],
        ];
      },
      (v: ReturnType<typeof fixture>) => {
        v.enrolledProductIds.push("a");
      },
    ]) {
      const value = fixture();
      edit(value);
      expect(run(value).status).toBe("invalid");
    }
  });
  it("bounds serialization and never consults caller getters or extra product/verified fields", () => {
    for (const input of [
      null,
      {
        get pixel() {
          throw new Error("must_not_read");
        },
      },
      "{",
      "x".repeat(65537),
      JSON.stringify({ ...fixture(), verified: true }),
      JSON.stringify({ ...fixture(), pixel: { ...candidate(), bin: "plastic" } }),
    ])
      expect(fuseReferenceIdentityEvidence(input).status).toBe("invalid");
  });
  it("is stable under input order and output mutation", () => {
    const value = fixture(candidate("b"), candidate());
    value.quarantineGroups = [["a", "c"]];
    const first = run(value);
    value.enrolledProductIds.reverse();
    value.quarantineGroups[0]?.reverse();
    expect(run(value)).toEqual(first);
  });
});
