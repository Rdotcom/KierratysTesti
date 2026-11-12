import { describe, expect, it } from "vitest";
import {
  REFERENCE_FEATURE_VERSION_V2,
  type ReferenceImageFeaturesV2,
  type ReferenceKeypointV2,
} from "../reference-image-features-v2";
import {
  matchReferenceImageV2,
  REFERENCE_MATCH_POLICY_V2,
  REFERENCE_MATCHER_VERSION_V2,
  type ReferenceCatalogueEntryV2,
} from "../reference-image-matcher-v2";

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

function features(count = 20, seed = 0x1234_5678): ReferenceImageFeaturesV2 {
  const next = generator(seed);
  const keypoints: ReferenceKeypointV2[] = [];
  for (let index = 0; index < count; index++) {
    const x = 0.1 + (next() / 0xffff_ffff) * 0.8;
    const y = 0.1 + (next() / 0xffff_ffff) * 0.8;
    keypoints.push({ x, y, scale: 1, descriptor: Array.from({ length: 8 }, next) });
  }
  return { version: REFERENCE_FEATURE_VERSION_V2, width: 256, height: 256, keypoints };
}

function remap(
  input: ReferenceImageFeaturesV2,
  transform: (point: ReferenceKeypointV2, index: number) => ReferenceKeypointV2,
): ReferenceImageFeaturesV2 {
  return { ...input, keypoints: input.keypoints.map(transform) };
}

function entry(
  input = features(),
  productId = "synthetic-product",
  referenceId = "synthetic-reference",
): ReferenceCatalogueEntryV2 {
  return { productId, referenceId, imageSha256: "a".repeat(64), features: input };
}

const expectUnknown = (result: ReturnType<typeof matchReferenceImageV2>) => {
  expect(result.status).toBe("unknown");
  expect(result).not.toHaveProperty("productId");
};

describe("scale-aware reference matcher V2: synthetic support, not identity accuracy", () => {
  it("returns only an inferred candidate with bounded provenance, never material or a bin", () => {
    const input = features();
    const result = matchReferenceImageV2(input, [entry(input)]);
    expect(result.status).toBe("candidate");
    expect(result).toMatchObject({
      algorithmVersion: REFERENCE_MATCHER_VERSION_V2,
      featureVersion: REFERENCE_FEATURE_VERSION_V2,
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
      (point: ReferenceKeypointV2) => ({ ...point, x: point.x + 0.04, y: point.y - 0.03 }),
    ],
    ["quarter-turn", (point: ReferenceKeypointV2) => ({ ...point, x: 1 - point.y, y: point.x })],
    [
      "moderate scale",
      (point: ReferenceKeypointV2) => ({
        ...point,
        x: point.x * 0.7 + 0.1,
        y: point.y * 0.7 + 0.1,
      }),
    ],
    [
      "moderate shear",
      (point: ReferenceKeypointV2) => ({
        ...point,
        x: point.x * 0.8 + point.y * 0.1,
        y: point.y * 0.8 + 0.05,
      }),
    ],
  ] as const)("checks a coherent %s from synthetic locations", (_name, transform) => {
    const reference = features();
    expect(matchReferenceImageV2(remap(reference, transform), [entry(reference)]).status).toBe(
      "candidate",
    );
  });

  it("accepts small binary perturbations through Hamming distance rather than exact equality", () => {
    const reference = features();
    const query = remap(reference, (point) => ({
      ...point,
      descriptor: point.descriptor.map((word) => (word ^ 1) >>> 0),
    }));
    expect(matchReferenceImageV2(query, [entry(reference)]).status).toBe("candidate");
  });

  it("rejects descriptors outside the absolute distance gate", () => {
    const reference = features();
    const query = remap(reference, (point) => ({
      ...point,
      descriptor: point.descriptor.map((word) => (word ^ 0x5555_5555) >>> 0),
    }));
    expectUnknown(matchReferenceImageV2(query, [entry(reference)]));
  });

  it("rejects tied repetitive descriptors rather than constructing arbitrary correspondences", () => {
    const reference = remap(features(), (point) => ({ ...point, descriptor: Array(8).fill(0) }));
    expectUnknown(matchReferenceImageV2(reference, [entry(reference)]));
  });

  it("does not treat an alternate scale at the same site as an independent distractor", () => {
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
    expect(matchReferenceImageV2(query, [entry(reference)]).status).toBe("candidate");
  });

  it("rejects exact descriptor matches with incoherent geometric locations", () => {
    const reference = features();
    const query = remap(reference, (point, index) => ({
      ...point,
      x: reference.keypoints[(index * 7 + 3) % 20]?.x ?? 0,
      y: reference.keypoints[(index * 11 + 5) % 20]?.y ?? 0,
    }));
    expectUnknown(matchReferenceImageV2(query, [entry(reference)]));
  });

  it("refuses a reflected geometry rather than counting a mirrored product as identity", () => {
    const reference = features();
    const query = remap(reference, (point) => ({ ...point, x: 1 - point.x }));
    expectUnknown(matchReferenceImageV2(query, [entry(reference)]));
  });

  it("refuses collinear correspondences that cannot determine an affine transform", () => {
    const reference = remap(features(), (point, index) => ({
      ...point,
      x: 0.1 + index * 0.03,
      y: 0.1 + index * 0.03,
    }));
    expectUnknown(matchReferenceImageV2(reference, [entry(reference)]));
  });

  it("refuses a tiny local patch even when all its descriptors agree", () => {
    const reference = remap(features(), (point) => ({
      ...point,
      x: 0.4 + point.x * 0.1,
      y: 0.4 + point.y * 0.1,
    }));
    expectUnknown(matchReferenceImageV2(reference, [entry(reference)]));
  });

  it("refuses extreme compression even if enough synthetic descriptors survive", () => {
    const reference = features();
    const query = remap(reference, (point) => ({ ...point, x: 0.4 + point.x * 0.05, y: point.y }));
    expectUnknown(matchReferenceImageV2(query, [entry(reference)]));
  });

  it("needs at least eight independent mutual correspondences", () => {
    const reference = features(7);
    expect(matchReferenceImageV2(reference, [entry(reference)])).toMatchObject({
      status: "unknown",
      reason: "low_detail",
    });
    const query = features();
    expectUnknown(matchReferenceImageV2(query, [entry(reference)]));
  });

  it("returns ambiguity for two products sharing accepted visual evidence, independent of order", () => {
    const query = features();
    const a = entry(query, "product-a", "reference-a");
    const b = entry(query, "product-b", "reference-b");
    const result = matchReferenceImageV2(query, [b, a]);
    expect(result).toMatchObject({ status: "ambiguous", productIds: ["product-a", "product-b"] });
    expect(result).toEqual(matchReferenceImageV2(query, [a, b]));
    expect(result).not.toHaveProperty("productId");
  });

  it("does not count several views of one product as competing identities", () => {
    const query = features();
    const catalog = [entry(query, "one-product", "front"), entry(query, "one-product", "back")];
    const result = matchReferenceImageV2(query, catalog);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("Expected one synthetic product");
    expect(result.productId).toBe("one-product");
  });

  it("keeps reference evidence deterministic under catalogue order", () => {
    const query = features();
    const first = entry(query, "one-product", "a-reference");
    const second = entry(query, "one-product", "z-reference");
    expect(matchReferenceImageV2(query, [first, second])).toEqual(
      matchReferenceImageV2(query, [second, first]),
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
    expect(matchReferenceImageV2(query, [entry(good)]).status).toBe("candidate");
    expectUnknown(matchReferenceImageV2(query, [entry(bad)]));
    const catalog = [entry(good, "one-product", "good"), entry(bad, "one-product", "bad")];
    expect(matchReferenceImageV2(query, catalog).status).toBe("candidate");
    expect(matchReferenceImageV2(query, catalog.slice().reverse()).status).toBe("candidate");
  });

  it("does not mutate input descriptors, catalogue metadata or point locations", () => {
    const query = features();
    const catalog = [entry(query)];
    const before = JSON.stringify({ query, catalog });
    matchReferenceImageV2(query, catalog);
    expect(JSON.stringify({ query, catalog })).toBe(before);
  });

  it("handles empty catalogues without inventing a product", () => {
    expect(matchReferenceImageV2(features(), [])).toMatchObject({
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
    expect(matchReferenceImageV2(value, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it.each([NaN, Infinity, -1, 0x1_0000_0000, 0.5])("rejects invalid descriptor word %s", (word) => {
    const query = remap(features(), (point, index) =>
      index ? point : { ...point, descriptor: [word, ...point.descriptor.slice(1)] },
    );
    expect(matchReferenceImageV2(query, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it.each([NaN, Infinity, -0.01, 1.01])("rejects invalid normalized coordinate %s", (x) => {
    const query = remap(features(), (point, index) => (index ? point : { ...point, x }));
    expect(matchReferenceImageV2(query, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });

  it("rejects malformed descriptor arity and sparse descriptor arrays", () => {
    for (const descriptor of [[], Array(7).fill(0), Array(9).fill(0), Array(8)]) {
      const query = remap(features(), (point, index) => (index ? point : { ...point, descriptor }));
      expect(matchReferenceImageV2(query, [])).toMatchObject({
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
    expect(matchReferenceImageV2({ ...query, keypoints: points }, [])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
    const catalog = Array(33);
    Object.defineProperty(catalog, 0, {
      get() {
        throw new Error("Must not traverse oversized catalogue");
      },
    });
    expect(matchReferenceImageV2(query, catalog)).toMatchObject({
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
    expect(matchReferenceImageV2(throwing, [])).toMatchObject({
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
      matchReferenceImageV2(
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
    expect(matchReferenceImageV2(query, catalog)).toMatchObject({
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
      expect(matchReferenceImageV2(query, catalog).status).toBe("candidate");
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
          ? matchReferenceImageV2({ ...input, keypoints: proxy }, [entry(input)])
          : matchReferenceImageV2(input, proxy);
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
    expect(matchReferenceImageV2(features(), catalog)).toMatchObject({
      status: "invalid",
      reason: "invalid_catalogue",
    });
  });

  it("keeps the declared hypothesis budget fixed and descriptors bounded at the maximum", () => {
    const query = features(REFERENCE_MATCH_POLICY_V2.maximumKeypoints);
    const result = matchReferenceImageV2(query, [entry(query)]);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("Expected maximum synthetic feature match");
    expect(result.evidence.hypotheses).toBe(REFERENCE_MATCH_POLICY_V2.maximumAffineHypotheses);
    // The fixed128 descriptor cap is not128 independent spatial sites. These
    // deterministic positions contain three within3px of another site.
    expect(result.evidence.inliers).toBe(125);
  });

  it("retains only distinct physical supports when several scales describe each site", () => {
    const original = features(12);
    const multi = {
      ...original,
      keypoints: original.keypoints.flatMap((point) =>
        [1, Math.SQRT2, 2, 2 * Math.SQRT2].map((scale) => ({ ...point, scale })),
      ),
    };
    const result = matchReferenceImageV2(multi, [entry(multi)]);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("expected distinct physical supports");
    expect(result.evidence.correspondences).toBe(12);
    expect(result.evidence.inliers).toBe(12);
  });

  it("cannot turn three physical supports into twelve independent inliers with scale copies", () => {
    const original = features(3);
    const multi = {
      ...original,
      keypoints: original.keypoints.flatMap((point) =>
        [1, Math.SQRT2, 2, 2 * Math.SQRT2].map((scale) => ({ ...point, scale })),
      ),
    };
    expectUnknown(matchReferenceImageV2(multi, [entry(multi)]));
  });

  function driftedScaleSupports(
    centers: readonly (readonly [number, number])[],
  ): ReferenceImageFeaturesV2 {
    const next = generator(123456789);
    const shifts = [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ] as const;
    const scales = [1, Math.SQRT2, 2, 2 * Math.SQRT2];
    return {
      version: REFERENCE_FEATURE_VERSION_V2,
      width: 256,
      height: 256,
      keypoints: centers.flatMap(([x, y]) =>
        shifts.map(([dx, dy], index) => ({
          x: x + dx / 255,
          y: y + dy / 255,
          scale: scales[index] ?? 1,
          // Distinct synthetic descriptors model scale-conditioned observations,
          // not a real photo or evidence of physical independence.
          descriptor: Array.from({ length: 8 }, next),
        })),
      ),
    };
  }

  it("does not inflate three spatial sites through scale-dependent two-pixel corner drift", () => {
    const drifted = driftedScaleSupports([
      [0.2, 0.2],
      [0.7, 0.2],
      [0.4, 0.7],
    ]);
    expect(drifted.keypoints).toHaveLength(12);
    expectUnknown(matchReferenceImageV2(drifted, [entry(drifted)]));
  });

  it("retains eight well-separated sites while collapsing their drifted scale copies", () => {
    const drifted = driftedScaleSupports([
      [0.2, 0.2],
      [0.5, 0.2],
      [0.8, 0.2],
      [0.2, 0.5],
      [0.5, 0.5],
      [0.8, 0.5],
      [0.2, 0.8],
      [0.5, 0.8],
    ]);
    const result = matchReferenceImageV2(drifted, [entry(drifted)]);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("expected separated synthetic sites");
    expect(result.evidence.correspondences).toBe(8);
    expect(result.evidence.inliers).toBe(8);
  });

  it("deduplicates either query or reference supports before geometric consensus", () => {
    const original = features(12);
    const locations = original.keypoints.slice(0, 3);
    const collapsed = remap(original, (point, index) => ({
      ...point,
      x: locations[index % 3]?.x ?? 0,
      y: locations[index % 3]?.y ?? 0,
    }));
    expectUnknown(matchReferenceImageV2(original, [entry(collapsed)]));
    expectUnknown(matchReferenceImageV2(collapsed, [entry(original)]));
  });

  it.each([undefined, 0, 0.9, 4.01, Infinity, Number.NaN, "1"])(
    "rejects malformed scale metadata %s",
    (scale) => {
      const query = features();
      const invalid = {
        ...query,
        keypoints: query.keypoints.map((point) => ({ ...point, scale })),
      };
      expect(matchReferenceImageV2(invalid, [entry(query)])).toMatchObject({
        status: "invalid",
        reason: "invalid_query",
      });
      expect(matchReferenceImageV2(query, [{ ...entry(query), features: invalid }])).toMatchObject({
        status: "invalid",
        reason: "invalid_catalogue",
      });
    },
  );

  it("explicitly refuses V1 feature versions, even if a scale field is supplied", () => {
    const query = features();
    const older = { ...query, version: "pixel-corners-v1" };
    expect(matchReferenceImageV2(older, [entry(query)])).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
    expect(matchReferenceImageV2(query, [{ ...entry(query), features: older }])).toMatchObject({
      status: "invalid",
      reason: "invalid_catalogue",
    });
  });
});
