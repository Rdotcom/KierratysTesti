import { describe, expect, it } from "vitest";
import {
  deriveReferenceIdentityGuard,
  guardReferenceIdentity,
} from "../reference-image-identity-guard";
import type { ReferenceMatchResultV2 } from "../reference-image-matcher-v2";
const fixture = () => ({
  inventory: [
    { referenceId: "a-1", productId: "a" },
    { referenceId: "b-1", productId: "b" },
    { referenceId: "c-1", productId: "c" },
  ],
  observations: [
    { referenceId: "a-1", productId: "a", possibleProductIds: ["a", "b"] },
    { referenceId: "b-1", productId: "b", possibleProductIds: ["b"] },
    { referenceId: "c-1", productId: "c", possibleProductIds: ["c"] },
  ],
});
const candidate = (productId: string): ReferenceMatchResultV2 => ({
  status: "candidate",
  productId,
  algorithmVersion: "reference-scale-affine-v2",
  featureVersion: "pixel-scale-corners-v2",
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  evidence: {
    referenceId: `${productId}-1`,
    imageSha256: "a".repeat(64),
    correspondences: 12,
    inliers: 12,
    inlierFraction: 1,
    referenceCoverage: 0.1,
    queryCoverage: 0.1,
    hypotheses: 1,
  },
});
function ready(value = fixture()) {
  const parsed = deriveReferenceIdentityGuard(JSON.stringify(value));
  if (parsed.status !== "ready") throw new Error("synthetic_guard_required");
  return parsed.guard;
}
describe("generic catalogue self-confusion quarantine", () => {
  it("rejects a lone visually plausible SKU when its reference family is already confusable", () => {
    const guard = ready(),
      original = candidate("b"),
      guarded = guardReferenceIdentity(original, guard);
    expect(guarded).toMatchObject({
      status: "ambiguous",
      productIds: ["a", "b"],
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
    });
    expect(original.status).toBe("candidate");
    expect(guarded).not.toHaveProperty("productId");
    expect(guarded).not.toHaveProperty("bin");
  });
  it("never invents a different identity or changes unaffected candidates", () => {
    const original = candidate("c");
    expect(guardReferenceIdentity(original, ready())).toBe(original);
  });
  it("preserves unknown, ambiguous and invalid results without upgrading them", () => {
    for (const result of [
      { ...candidate("a"), status: "unknown", reason: "no_geometric_match" },
      { ...candidate("a"), status: "ambiguous", productIds: ["a", "c"] },
      { ...candidate("a"), status: "invalid", reason: "invalid_query" },
    ] as ReferenceMatchResultV2[])
      expect(guardReferenceIdentity(result, ready())).toBe(result);
  });
  it("joins transitive conflicts independently of row order or product-specific names", () => {
    const value = fixture();
    value.observations[1]!.possibleProductIds = ["b", "c"];
    const first = ready(value);
    value.inventory.reverse();
    value.observations.reverse();
    expect(ready(value)).toEqual(first);
    expect(first.groups[0]?.productIds).toEqual(["a", "b", "c"]);
  });
  it("quarantines a reference that incorrectly self-selects another enrolled identity", () => {
    const value = fixture();
    value.observations[0]!.possibleProductIds = ["b"];
    expect(ready(value).groups[0]?.productIds).toEqual(["a", "b"]);
  });
  it("allows complete, nonconflicting self observations without manufacturing a conflict", () => {
    const value = fixture();
    value.observations[0]!.possibleProductIds = ["a"];
    expect(ready(value).groups).toEqual([]);
  });
  it("does not turn an unknown self observation into an identity fact", () => {
    const value = fixture();
    value.observations[0]!.possibleProductIds = [];
    expect(ready(value).groups).toEqual([]);
  });
  it("requires exact unique self/inventory joins and rejects unlisted identities", () => {
    for (const edit of [
      (v: ReturnType<typeof fixture>) => {
        v.observations.pop();
      },
      (v: ReturnType<typeof fixture>) => {
        v.observations[1] = v.observations[0]!;
      },
      (v: ReturnType<typeof fixture>) => {
        v.observations[0]!.productId = "invented";
      },
      (v: ReturnType<typeof fixture>) => {
        v.observations[0]!.possibleProductIds = ["outside"];
      },
      (v: ReturnType<typeof fixture>) => {
        v.observations[0]!.possibleProductIds = ["a", "a"];
      },
      (v: ReturnType<typeof fixture>) => {
        v.inventory.push(v.inventory[0]!);
      },
    ]) {
      const value = fixture();
      edit(value);
      expect(deriveReferenceIdentityGuard(JSON.stringify(value))).toEqual({ status: "invalid" });
    }
  });
  it("bounds serialized data before parsing, never reads objects/getters and rejects extra fields", () => {
    let reads = 0;
    const hostile = {
      get inventory() {
        reads++;
        throw new Error("must_not_read");
      },
    };
    for (const value of [
      hostile,
      null,
      "bad-json",
      " ".repeat(65537),
      JSON.stringify({ ...fixture(), verifiedIdentity: true }),
    ])
      expect(deriveReferenceIdentityGuard(value)).toEqual({ status: "invalid" });
    expect(reads).toBe(0);
  });
  it("owns and freezes its graph without retaining mutable caller data", () => {
    const value = fixture(),
      guard = ready(value);
    value.observations[0]!.possibleProductIds = [];
    expect(guard.groups[0]?.productIds).toEqual(["a", "b"]);
    expect(Object.isFrozen(guard.groups)).toBe(true);
    expect(Object.isFrozen(guard.groups[0]?.productIds)).toBe(true);
  });
});
