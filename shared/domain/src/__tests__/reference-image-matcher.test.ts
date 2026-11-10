import { describe, expect, it } from "vitest";
import {
  REFERENCE_FEATURE_VERSION,
  type ReferenceImageFeatures,
  type ReferenceKeypoint,
} from "../reference-image-features";
import {
  REFERENCE_MATCHER_VERSION,
  REFERENCE_MATCH_POLICY,
  type ReferenceCatalogueEntry,
  matchReferenceImage,
} from "../reference-image-matcher";

// Synthetic descriptors and geometry only: these fixtures establish no image,
// product-identity, material, camera or recognition-accuracy evidence.
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function features(count = 20, seed = 0x1234_5678): ReferenceImageFeatures {
  const next = generator(seed);
  const keypoints: ReferenceKeypoint[] = [];
  for (let index = 0; index < count; index++) {
    const x = 0.1 + (next() / 0xffff_ffff) * 0.8;
    const y = 0.1 + (next() / 0xffff_ffff) * 0.8;
    keypoints.push({ x, y, descriptor: Array.from({ length: 8 }, next) });
  }
  return { version: REFERENCE_FEATURE_VERSION, width: 256, height: 256, keypoints };
}

function remap(
  input: ReferenceImageFeatures,
  transform: (point: ReferenceKeypoint, index: number) => ReferenceKeypoint,
): ReferenceImageFeatures {
  return { ...input, keypoints: input.keypoints.map(transform) };
}

function entry(
  input = features(),
  productId = "synthetic-product",
  referenceId = "synthetic-reference",
): ReferenceCatalogueEntry {
  return { productId, referenceId, imageSha256: "a".repeat(64), features: input };
}

const expectUnknown = (result: ReturnType<typeof matchReferenceImage>) => {
  expect(result.status).toBe("unknown");
  expect(result).not.toHaveProperty("productId");
};

describe("original reference matcher: synthetic correspondences, not identity accuracy", () => {
  it("returns only an inferred candidate with bounded provenance, never material or a bin", () => {
    const input = features();
    const result = matchReferenceImage(input, [entry(input)]);
    expect(result.status).toBe("candidate");
    expect(result).toMatchObject({
      algorithmVersion: REFERENCE_MATCHER_VERSION,
      featureVersion: REFERENCE_FEATURE_VERSION,
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
    });
    if (result.status !== "candidate") throw new Error("Expected synthetic correspondence");
    expect(result.productId).toBe("synthetic-product");
    expect(result.evidence).toMatchObject({
      referenceId: "synthetic-reference",
      imageSha256: "a".repeat(64),
      correspondences: 20,
      inliers: 20,
      inlierFraction: 1,
    });
    expect(result.evidence.hypotheses).toBeLessThanOrEqual(256);
    expect(result.evidence.queryCoverage).toBeGreaterThan(0.035);
    expect(result.evidence.referenceCoverage).toBeGreaterThan(0.035);
    for (const field of ["material", "bin", "gtin", "verifiedIdentity", "probability"])
      expect(result).not.toHaveProperty(field);
  });

  it.each([
    [
      "translation",
      (point: ReferenceKeypoint) => ({ ...point, x: point.x + 0.04, y: point.y - 0.03 }),
    ],
    ["quarter-turn", (point: ReferenceKeypoint) => ({ ...point, x: 1 - point.y, y: point.x })],
    [
      "moderate scale",
      (point: ReferenceKeypoint) => ({ ...point, x: point.x * 0.7 + 0.1, y: point.y * 0.7 + 0.1 }),
    ],
    [
      "moderate shear",
      (point: ReferenceKeypoint) => ({
        ...point,
        x: point.x * 0.8 + point.y * 0.1,
        y: point.y * 0.8 + 0.05,
      }),
    ],
  ] as const)("checks a coherent %s from synthetic locations", (_name, transform) => {
    const reference = features();
    expect(matchReferenceImage(remap(reference, transform), [entry(reference)]).status).toBe(
      "candidate",
    );
  });

  it("accepts small binary perturbations through Hamming distance rather than exact equality", () => {
    const reference = features();
    const query = remap(reference, (point) => ({
      ...point,
      descriptor: point.descriptor.map((word) => (word ^ 1) >>> 0),
    }));
    expect(matchReferenceImage(query, [entry(reference)]).status).toBe("candidate");
  });

  it("rejects descriptors outside the absolute distance gate", () => {
    const reference = features();
    const query = remap(reference, (point) => ({
      ...point,
      descriptor: point.descriptor.map((word) => (word ^ 0x5555_5555) >>> 0),
    }));
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("rejects tied repetitive descriptors rather than constructing arbitrary correspondences", () => {
    const reference = remap(features(), (point) => ({ ...point, descriptor: Array(8).fill(0) }));
    expectUnknown(matchReferenceImage(reference, [entry(reference)]));
  });

  it("requires distinctive nearest matches and mutual correspondence", () => {
    const reference = features(8);
    const duplicated = reference.keypoints.flatMap((point) => [
      point,
      {
        ...point,
        x: point.x + 0.001,
        descriptor: point.descriptor.map((word, index) => (index === 0 ? (word ^ 1) >>> 0 : word)),
      },
    ]);
    const query = { ...reference, keypoints: duplicated };
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("rejects exact descriptor matches with incoherent geometric locations", () => {
    const reference = features();
    const query = remap(reference, (point, index) => ({
      ...point,
      x: reference.keypoints[(index * 7 + 3) % 20]?.x ?? 0,
      y: reference.keypoints[(index * 11 + 5) % 20]?.y ?? 0,
    }));
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("refuses a reflected geometry rather than counting a mirrored product as identity", () => {
    const reference = features();
    const query = remap(reference, (point) => ({ ...point, x: 1 - point.x }));
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("refuses collinear correspondences that cannot determine an affine transform", () => {
    const reference = remap(features(), (point, index) => ({
      ...point,
      x: 0.1 + index * 0.03,
      y: 0.1 + index * 0.03,
    }));
    expectUnknown(matchReferenceImage(reference, [entry(reference)]));
  });

  it("refuses a tiny local patch even when all its descriptors agree", () => {
    const reference = remap(features(), (point) => ({
      ...point,
      x: 0.4 + point.x * 0.1,
      y: 0.4 + point.y * 0.1,
    }));
    expectUnknown(matchReferenceImage(reference, [entry(reference)]));
  });

  it("refuses extreme compression even if enough synthetic descriptors survive", () => {
    const reference = features();
    const query = remap(reference, (point) => ({ ...point, x: 0.4 + point.x * 0.05, y: point.y }));
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("needs at least eight independent mutual correspondences", () => {
    const reference = features(7);
    expect(matchReferenceImage(reference, [entry(reference)])).toMatchObject({
      status: "unknown",
      reason: "low_detail",
    });
    const query = features();
    expectUnknown(matchReferenceImage(query, [entry(reference)]));
  });

  it("returns ambiguity for two products sharing accepted visual evidence, independent of order", () => {
    const query = features();
    const a = entry(query, "product-a", "reference-a");
    const b = entry(query, "product-b", "reference-b");
    const result = matchReferenceImage(query, [b, a]);
    expect(result).toMatchObject({ status: "ambiguous", productIds: ["product-a", "product-b"] });
    expect(result).toEqual(matchReferenceImage(query, [a, b]));
    expect(result).not.toHaveProperty("productId");
  });

  it("does not count several views of one product as competing identities", () => {
    const query = features();
    const catalog = [entry(query, "one-product", "front"), entry(query, "one-product", "back")];
    const result = matchReferenceImage(query, catalog);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("Expected one synthetic product");
    expect(result.productId).toBe("one-product");
  });

  it("keeps reference evidence deterministic under catalogue order", () => {
    const query = features();
    const first = entry(query, "one-product", "a-reference");
    const second = entry(query, "one-product", "z-reference");
    expect(matchReferenceImage(query, [first, second])).toEqual(
      matchReferenceImage(query, [second, first]),
    );
  });

  it("does not let a higher-inlier ineligible view hide a valid view of the same product", () => {
    const query = features();
    const good = { ...query, keypoints: query.keypoints.slice(0, 8) };
    const bad = remap(query, (point, index) =>
      index < 9
        ? point
        : {
            ...point,
            x: query.keypoints[(index * 7 + 3) % 20]?.x ?? 0,
            y: query.keypoints[(index * 11 + 5) % 20]?.y ?? 0,
          },
    );
    expect(matchReferenceImage(query, [entry(good)]).status).toBe("candidate");
    expectUnknown(matchReferenceImage(query, [entry(bad)]));
    const catalog = [entry(good, "one-product", "good"), entry(bad, "one-product", "bad")];
    expect(matchReferenceImage(query, catalog).status).toBe("candidate");
    expect(matchReferenceImage(query, catalog.slice().reverse()).status).toBe("candidate");
  });

  it("does not mutate input descriptors, catalogue metadata or point locations", () => {
    const query = features();
    const catalog = [entry(query)];
    const before = JSON.stringify({ query, catalog });
    matchReferenceImage(query, catalog);
    expect(JSON.stringify({ query, catalog })).toBe(before);
  });

  it("handles empty catalogues without inventing a product", () => {
    expect(matchReferenceImage(features(), [])).toMatchObject({
      status: "unknown",
      reason: "empty_catalogue",
    });
  });

  it.each([
    null,
    undefined,
    {},
    [],
    "pixels",
    { ...features(), version: "unknown" },
    { ...features(), width: 257 },
    { ...features(), height: 31 },
    { ...features(), width: 128.5 },
  ])("rejects malformed feature boundary %#", (value) => {
    expect(matchReferenceImage(value, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it.each([NaN, Infinity, -1, 0x1_0000_0000, 0.5])("rejects invalid descriptor word %s", (word) => {
    const query = remap(features(), (point, index) =>
      index ? point : { ...point, descriptor: [word, ...point.descriptor.slice(1)] },
    );
    expect(matchReferenceImage(query, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it.each([NaN, Infinity, -0.01, 1.01])("rejects invalid normalized coordinate %s", (x) => {
    const query = remap(features(), (point, index) => (index ? point : { ...point, x }));
    expect(matchReferenceImage(query, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it("rejects malformed descriptor arity and sparse descriptor arrays", () => {
    for (const descriptor of [[], Array(7).fill(0), Array(9).fill(0), Array(8)]) {
      const query = remap(features(), (point, index) => (index ? point : { ...point, descriptor }));
      expect(matchReferenceImage(query, [])).toMatchObject({
        status: "invalid",
        reason: "invalid_query",
      });
    }
  });

  it("bounds keypoint and catalogue arrays before reading their elements", () => {
    const query = features();
    const points = Array(129);
    Object.defineProperty(points, 0, {
      get() {
        throw new Error("Must not traverse oversized keypoint array");
      },
    });
    expect(matchReferenceImage({ ...query, keypoints: points }, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
    const catalog = Array(33);
    Object.defineProperty(catalog, 0, {
      get() {
        throw new Error("Must not traverse oversized catalogue");
      },
    });
    expect(matchReferenceImage(query, catalog)).toMatchObject({
      status: "invalid",
      reason: "invalid_catalogue",
    });
  });

  it("contains hostile feature, descriptor and catalogue accessors", () => {
    const query = features();
    const throwing = {
      get keypoints() {
        throw new Error("Untrusted field");
      },
    };
    expect(matchReferenceImage(throwing, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
    const words = Array(8).fill(0);
    Object.defineProperty(words, 0, {
      get() {
        throw new Error("Untrusted descriptor");
      },
    });
    expect(
      matchReferenceImage(
        remap(query, (point, index) => (index ? point : { ...point, descriptor: words })),
        [],
      ),
    ).toMatchObject({ status: "invalid", reason: "invalid_query" });
    const catalog = [
      {
        ...entry(query),
        get features() {
          throw new Error("Untrusted catalogue");
        },
      },
    ];
    expect(matchReferenceImage(query, catalog)).toMatchObject({
      status: "invalid",
      reason: "invalid_catalogue",
    });
  });

  it.each(["keypoints", "descriptor", "catalogue"] as const)(
    "bounds %s by indexed length without invoking a caller-supplied iterator",
    (boundary) => {
      const query = features();
      const catalog = [entry(query)];
      const firstPoint = query.keypoints[0];
      if (!firstPoint) throw new Error("Missing synthetic keypoint");
      const target =
        boundary === "keypoints"
          ? query.keypoints
          : boundary === "descriptor"
            ? firstPoint.descriptor
            : catalog;
      let invoked = false;
      Object.defineProperty(target, Symbol.iterator, {
        value() {
          invoked = true;
          throw new Error("Untrusted iterator could be unbounded");
        },
      });
      expect(matchReferenceImage(query, catalog).status).toBe("candidate");
      expect(invoked).toBe(false);
    },
  );

  it.each(["keypoints", "catalogue"] as const)(
    "captures the validated %s length once rather than trusting a changing proxy",
    (boundary) => {
      const input = features();
      let lengthReads = 0;
      const target = boundary === "keypoints" ? input.keypoints : [entry(input)];
      const proxy = new Proxy(target, {
        get(array, property, receiver) {
          if (property === "length") {
            lengthReads++;
            return lengthReads === 1 ? array.length : 1_000_000;
          }
          return Reflect.get(array, property, receiver);
        },
      });
      const result =
        boundary === "keypoints"
          ? matchReferenceImage({ ...input, keypoints: proxy }, [entry(input)])
          : matchReferenceImage(input, proxy);
      expect(result.status).toBe("candidate");
      expect(lengthReads).toBe(1);
    },
  );

  it.each([
    null,
    {},
    [{ ...entry(), productId: "Name with spaces" }],
    [{ ...entry(), productId: "a".repeat(65) }],
    [{ ...entry(), referenceId: "https://untrusted.example/image" }],
    [{ ...entry(), imageSha256: "not-a-hash" }],
    [{ ...entry(), imageSha256: "A".repeat(64) }],
    [{ ...entry(), features: { ...features(), version: "stale" } }],
    [entry(), entry()],
  ])("rejects malformed or duplicate catalogue input %#", (catalog) => {
    expect(matchReferenceImage(features(), catalog)).toMatchObject({
      status: "invalid",
      reason: "invalid_catalogue",
    });
  });

  it("keeps the declared hypothesis budget fixed and descriptors bounded at the maximum", () => {
    const query = features(REFERENCE_MATCH_POLICY.maximumKeypoints);
    const result = matchReferenceImage(query, [entry(query)]);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("Expected maximum synthetic feature match");
    expect(result.evidence.hypotheses).toBe(REFERENCE_MATCH_POLICY.maximumAffineHypotheses);
    expect(result.evidence.inliers).toBe(128);
  });
});
