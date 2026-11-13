import { describe, expect, it } from "vitest";
import { fuseReferenceIdentityEvidence } from "../reference-image-fusion";
import { fuseMonotoneReferenceIdentityEvidence } from "../reference-image-fusion-v2";

const candidate = (productId = "a") => ({ status: "candidate", productId });
const unknown = { status: "unknown" },
  failed = { status: "unavailable" };
const ambiguous = { status: "ambiguous", productIds: ["a", "b"] };
const fixture = (pixel: object = candidate(), embedding: object = unknown) => ({
  pixelImageSha256: "a".repeat(64),
  embeddingImageSha256: "a".repeat(64),
  pixel,
  embedding,
  enrolledProductIds: ["a", "b", "c"],
  quarantineGroups: [] as string[][],
});
const run = (value = fixture()) => fuseMonotoneReferenceIdentityEvidence(JSON.stringify(value));
describe("monotone evidence fusion without weaker safety gates", () => {
  it("repairs a previously discarded pixel candidate only for true embedding unknown", () => {
    expect(fuseReferenceIdentityEvidence(JSON.stringify(fixture())).status).toBe("unknown");
    expect(run()).toMatchObject({
      status: "candidate",
      productId: "a",
      reason: "pixel_preserved",
      integrationAllowed: false,
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
    });
  });
  it("retains known-family quarantine even against embedding unknown", () => {
    const input = fixture();
    input.quarantineGroups = [["a", "b"]];
    expect(run(input)).toMatchObject({ status: "ambiguous", productIds: ["a", "b"] });
  });
  it("does not preserve a pixel candidate against positive disagreement or ambiguity", () => {
    for (const embedding of [candidate("b"), ambiguous])
      expect(run(fixture(candidate(), embedding)).status).toBe("ambiguous");
  });
  it("never turns failure into abstention or a fallback candidate", () => {
    for (const input of [fixture(candidate(), failed), fixture(failed, candidate())])
      expect(run(input).status).toBe("unavailable");
  });
  it("rejects mismatched bytes and forged verified fields instead of falling back", () => {
    const input = fixture();
    input.embeddingImageSha256 = "b".repeat(64);
    expect(run(input).status).toBe("invalid");
    expect(run(fixture({ ...candidate(), verified: true })).status).toBe("invalid");
  });
  it("requires known enrolled products and valid disjoint quarantine groups", () => {
    expect(run(fixture(candidate("outside"))).status).toBe("invalid");
    const input = fixture();
    input.quarantineGroups = [
      ["a", "b"],
      ["b", "c"],
    ];
    expect(run(input).status).toBe("invalid");
  });
  it("retains all other v1 decisions across the Cartesian lane matrix", () => {
    for (const pixel of [unknown, failed, ambiguous, candidate(), candidate("b")])
      for (const embedding of [unknown, failed, ambiguous, candidate(), candidate("b")]) {
        const data = JSON.stringify(fixture(pixel, embedding)),
          v1 = fuseReferenceIdentityEvidence(data),
          v2 = fuseMonotoneReferenceIdentityEvidence(data);
        if (v1.status === "unknown" && pixel.status === "candidate")
          expect(v2).toMatchObject({ status: "candidate", reason: "pixel_preserved" });
        else expect(v2).toEqual({ ...v1, algorithmVersion: "reference-monotone-fusion-v2" });
      }
  });
  it("does not read caller objects or let malformed data reach the fallback parser", () => {
    for (const input of [
      null,
      {
        get pixel() {
          throw Error("must_not_read");
        },
      },
      "{",
      "x".repeat(65537),
    ])
      expect(fuseMonotoneReferenceIdentityEvidence(input).status).toBe("invalid");
  });
});
