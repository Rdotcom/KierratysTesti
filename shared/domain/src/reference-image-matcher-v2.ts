import {
  REFERENCE_FEATURE_VERSION_V2,
  type ReferenceImageFeaturesV2,
  type ReferenceKeypointV2,
} from "./reference-image-features-v2";

/** Own implementation of binary-feature correspondence and affine consensus.
 * These engineering gates are not calibrated identity probabilities.
 * No model, product database, material or sorting policy is embedded here.
 */
export const REFERENCE_MATCHER_VERSION_V2 = "reference-scale-affine-v2" as const;
export const REFERENCE_MATCH_POLICY_V2 = Object.freeze({
  maximumReferences: 32,
  maximumKeypoints: 128,
  maximumHammingDistance: 48,
  nearestRatio: 0.72,
  minimumDistanceGap: 12,
  maximumAffineHypotheses: 256,
  maximumReprojectionError: 0.025,
  minimumInliers: 8,
  minimumInlierFraction: 0.65,
  minimumCoverage: 0.035,
  // Descriptor-level pixels, projected to base pixels using both patch scales.
  // This is a conservative spatial proxy, not proof of physical independence.
  minimumSpatialSeparationPixels: 3,
});

export interface ReferenceCatalogueEntryV2 {
  productId: string;
  referenceId: string;
  /** Caller must bind descriptors to the decoded source bytes independently. */
  imageSha256: string;
  features: ReferenceImageFeaturesV2;
}

export interface ReferenceMatchEvidenceV2 {
  referenceId: string;
  imageSha256: string;
  correspondences: number;
  inliers: number;
  inlierFraction: number;
  referenceCoverage: number;
  queryCoverage: number;
  hypotheses: number;
}

interface MatchMetadata {
  algorithmVersion: typeof REFERENCE_MATCHER_VERSION_V2;
  featureVersion: typeof REFERENCE_FEATURE_VERSION_V2;
  verificationStatus: "inferred";
  confidence: "uncalibrated_visual_similarity";
}

export type ReferenceMatchResultV2 = MatchMetadata &
  (
    | { status: "candidate"; productId: string; evidence: ReferenceMatchEvidenceV2 }
    | { status: "ambiguous"; productIds: string[] }
    | {
        status: "unknown";
        reason: "empty_catalogue" | "low_detail" | "no_geometric_match";
      }
    | { status: "invalid"; reason: "invalid_query" | "invalid_catalogue" }
  );

const metadata: MatchMetadata = Object.freeze({
  algorithmVersion: REFERENCE_MATCHER_VERSION_V2,
  featureVersion: REFERENCE_FEATURE_VERSION_V2,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
});
const tokenPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const bounded = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

// Bound arrays BEFORE traversing them. Copy validated values; never continue
// computation on mutable/hostile descriptor objects supplied at the boundary.
function readFeatures(value: unknown): ReferenceImageFeaturesV2 | null {
  if (!isRecord(value)) return null;
  const { version, width, height, keypoints } = value;
  const pointCount = Array.isArray(keypoints) ? keypoints.length : -1;
  if (
    version !== REFERENCE_FEATURE_VERSION_V2 ||
    !bounded(width, 32, 256) ||
    !Number.isInteger(width) ||
    !bounded(height, 32, 256) ||
    !Number.isInteger(height) ||
    !Array.isArray(keypoints) ||
    !Number.isInteger(pointCount) ||
    pointCount < 0 ||
    pointCount > REFERENCE_MATCH_POLICY_V2.maximumKeypoints
  )
    return null;
  const copied: ReferenceKeypointV2[] = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const point = keypoints[pointIndex];
    if (!isRecord(point)) return null;
    const { x, y, scale, descriptor } = point;
    if (
      !bounded(x, 0, 1) ||
      !bounded(y, 0, 1) ||
      !bounded(scale, 1, 4) ||
      !Array.isArray(descriptor)
    )
      return null;
    if (descriptor.length !== 8) return null;
    const words: number[] = [];
    for (let wordIndex = 0; wordIndex < 8; wordIndex++) {
      const word = descriptor[wordIndex];
      if (!bounded(word, 0, 0xffff_ffff) || !Number.isInteger(word)) return null;
      words.push(word);
    }
    copied.push({ x, y, scale, descriptor: words });
  }
  return { version, width, height, keypoints: copied };
}

function readCatalogue(value: unknown): ReferenceCatalogueEntryV2[] | null {
  if (!Array.isArray(value)) return null;
  const count = value.length;
  if (!Number.isInteger(count) || count < 0 || count > REFERENCE_MATCH_POLICY_V2.maximumReferences)
    return null;
  const entries: ReferenceCatalogueEntryV2[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    const entry = value[index];
    if (!isRecord(entry)) return null;
    const { productId, referenceId, imageSha256 } = entry;
    if (
      typeof productId !== "string" ||
      !tokenPattern.test(productId) ||
      typeof referenceId !== "string" ||
      !tokenPattern.test(referenceId) ||
      seen.has(referenceId) ||
      typeof imageSha256 !== "string" ||
      !hashPattern.test(imageSha256)
    )
      return null;
    const features = readFeatures(entry.features);
    if (!features) return null;
    seen.add(referenceId);
    entries.push({ productId, referenceId, imageSha256, features });
  }
  return entries;
}

function popcount(value: number): number {
  const first = value - ((value >>> 1) & 0x5555_5555);
  const second = (first & 0x3333_3333) + ((first >>> 2) & 0x3333_3333);
  return ((((second + (second >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24) & 0xff;
}

function distance(a: ReferenceKeypointV2, b: ReferenceKeypointV2): number {
  let total = 0;
  for (let index = 0; index < 8; index++) {
    total += popcount((a.descriptor[index] ?? 0) ^ (b.descriptor[index] ?? 0));
  }
  return total;
}

interface Nearest {
  index: number;
  best: number;
  second: number;
}
function sameSite(
  a: ReferenceKeypointV2,
  b: ReferenceKeypointV2,
  image: ReferenceImageFeaturesV2,
): boolean {
  return (
    Math.hypot((a.x - b.x) * (image.width - 1), (a.y - b.y) * (image.height - 1)) <=
    REFERENCE_MATCH_POLICY_V2.minimumSpatialSeparationPixels * Math.max(a.scale, b.scale)
  );
}

function nearest(from: ReferenceKeypointV2, image: ReferenceImageFeaturesV2): Nearest {
  const ranked = image.keypoints
    .map((point, index) => ({ index, point, distance: distance(from, point) }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.point.x - b.point.x ||
        a.point.y - b.point.y ||
        a.point.scale - b.point.scale ||
        a.index - b.index,
    );
  const best = ranked[0];
  if (!best) return { index: -1, best: 257, second: 257 };
  // A second scale of the same physical site is not an independent distractor.
  // Distinctiveness is measured against the next DIFFERENT location.
  const second = ranked.find((candidate) => !sameSite(best.point, candidate.point, image));
  return { index: best.index, best: best.distance, second: second?.distance ?? 257 };
}

function distinctive(value: Nearest): boolean {
  return (
    value.index >= 0 &&
    value.best <= REFERENCE_MATCH_POLICY_V2.maximumHammingDistance &&
    value.best <= REFERENCE_MATCH_POLICY_V2.nearestRatio * value.second &&
    value.second - value.best >= REFERENCE_MATCH_POLICY_V2.minimumDistanceGap
  );
}

interface Pair {
  reference: ReferenceKeypointV2;
  query: ReferenceKeypointV2;
  distance: number;
}
function correspondences(
  reference: ReferenceImageFeaturesV2,
  query: ReferenceImageFeaturesV2,
): Pair[] {
  const forward = reference.keypoints.map((point) => nearest(point, query));
  const backward = query.keypoints.map((point) => nearest(point, reference));
  const pairs: Pair[] = [];
  for (const [index, value] of forward.entries()) {
    const reverse = backward[value.index];
    const referencePoint = reference.keypoints[index];
    const queryPoint = query.keypoints[value.index];
    const reversePoint = reverse ? reference.keypoints[reverse.index] : undefined;
    if (
      distinctive(value) &&
      reverse &&
      distinctive(reverse) &&
      referencePoint &&
      queryPoint &&
      reversePoint &&
      sameSite(referencePoint, reversePoint, reference)
    ) {
      pairs.push({ reference: referencePoint, query: queryPoint, distance: value.best });
    }
  }
  pairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.reference.x - b.reference.x ||
      a.reference.y - b.reference.y ||
      a.query.x - b.query.x ||
      a.query.y - b.query.y ||
      a.reference.scale - b.reference.scale ||
      a.query.scale - b.query.scale,
  );
  const unique: Pair[] = [];
  for (const pair of pairs) {
    if (
      unique.some(
        (selected) =>
          sameSite(pair.reference, selected.reference, reference) ||
          sameSite(pair.query, selected.query, query),
      )
    )
      continue;
    unique.push(pair);
  }
  return unique;
}

type Affine = readonly [number, number, number, number, number, number];
function affine(a: Pair, b: Pair, c: Pair): Affine | null {
  const x1 = b.reference.x - a.reference.x;
  const y1 = b.reference.y - a.reference.y;
  const x2 = c.reference.x - a.reference.x;
  const y2 = c.reference.y - a.reference.y;
  const determinant = x1 * y2 - y1 * x2;
  if (Math.abs(determinant) < 0.001) return null;
  const u1 = b.query.x - a.query.x;
  const v1 = b.query.y - a.query.y;
  const u2 = c.query.x - a.query.x;
  const v2 = c.query.y - a.query.y;
  const xx = (u1 * y2 - u2 * y1) / determinant;
  const xy = (u2 * x1 - u1 * x2) / determinant;
  const yx = (v1 * y2 - v2 * y1) / determinant;
  const yy = (v2 * x1 - v1 * x2) / determinant;
  const det = xx * yy - xy * yx;
  const norm = xx * xx + xy * xy + yx * yx + yy * yy;
  // No reflections, collapsing or extreme shear/stretch consensus.
  if (det < 0.1 || det > 10 || norm / det > 10) return null;
  const tx = a.query.x - xx * a.reference.x - xy * a.reference.y;
  const ty = a.query.y - yx * a.reference.x - yy * a.reference.y;
  const result: Affine = [xx, xy, tx, yx, yy, ty];
  return result.every(Number.isFinite) && Math.abs(tx) <= 1.5 && Math.abs(ty) <= 1.5
    ? result
    : null;
}
function consistent(pair: Pair, transform: Affine): boolean {
  const x = transform[0] * pair.reference.x + transform[1] * pair.reference.y + transform[2];
  const y = transform[3] * pair.reference.x + transform[4] * pair.reference.y + transform[5];
  return (
    Math.hypot(x - pair.query.x, y - pair.query.y) <=
    REFERENCE_MATCH_POLICY_V2.maximumReprojectionError
  );
}
function coverage(pairs: readonly Pair[], side: "reference" | "query"): number {
  if (!pairs.length) return 0;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const pair of pairs) {
    minX = Math.min(minX, pair[side].x);
    minY = Math.min(minY, pair[side].y);
    maxX = Math.max(maxX, pair[side].x);
    maxY = Math.max(maxY, pair[side].y);
  }
  return (maxX - minX) * (maxY - minY);
}

function geometricEvidence(
  entry: ReferenceCatalogueEntryV2,
  query: ReferenceImageFeaturesV2,
): ReferenceMatchEvidenceV2 {
  const pairs = correspondences(entry.features, query);
  let best: Pair[] = [];
  let hypotheses = 0;
  let state = 0x6b69_6731;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % pairs.length;
  };
  if (pairs.length >= REFERENCE_MATCH_POLICY_V2.minimumInliers) {
    // Fixed budget/seed, independent of any product name, data label or outcome.
    for (let attempt = 0; attempt < REFERENCE_MATCH_POLICY_V2.maximumAffineHypotheses; attempt++) {
      hypotheses++;
      const indices =
        attempt < pairs.length - 2 ? [0, attempt + 1, attempt + 2] : [next(), next(), next()];
      const [a, b, c] = indices.map((index) => pairs[index]);
      if (!a || !b || !c || new Set(indices).size !== 3) continue;
      const transform = affine(a, b, c);
      if (!transform) continue;
      const inliers = pairs.filter((pair) => consistent(pair, transform));
      if (inliers.length > best.length) best = inliers;
    }
  }
  return {
    referenceId: entry.referenceId,
    imageSha256: entry.imageSha256,
    correspondences: pairs.length,
    inliers: best.length,
    inlierFraction: pairs.length ? best.length / pairs.length : 0,
    referenceCoverage: coverage(best, "reference"),
    queryCoverage: coverage(best, "query"),
    hypotheses,
  };
}
const eligible = (value: ReferenceMatchEvidenceV2) =>
  value.inliers >= REFERENCE_MATCH_POLICY_V2.minimumInliers &&
  value.inlierFraction >= REFERENCE_MATCH_POLICY_V2.minimumInlierFraction &&
  value.referenceCoverage >= REFERENCE_MATCH_POLICY_V2.minimumCoverage &&
  value.queryCoverage >= REFERENCE_MATCH_POLICY_V2.minimumCoverage;

/** Offline candidate retrieval only. Callers may not treat this as verified
 * product identity, barcode, material, safety or a recycling destination.
 * The catalogue must already have separately reviewed identity/rights provenance.
 */
export function matchReferenceImageV2(
  queryInput: unknown,
  catalogueInput: unknown,
): ReferenceMatchResultV2 {
  let query: ReferenceImageFeaturesV2 | null;
  try {
    query = readFeatures(queryInput);
  } catch {
    query = null;
  }
  if (!query) return { ...metadata, status: "invalid", reason: "invalid_query" };
  let catalogue: ReferenceCatalogueEntryV2[] | null;
  try {
    catalogue = readCatalogue(catalogueInput);
  } catch {
    catalogue = null;
  }
  if (!catalogue) return { ...metadata, status: "invalid", reason: "invalid_catalogue" };
  if (!catalogue.length) return { ...metadata, status: "unknown", reason: "empty_catalogue" };
  if (query.keypoints.length < 8) return { ...metadata, status: "unknown", reason: "low_detail" };
  const products = new Map<string, ReferenceMatchEvidenceV2>();
  for (const entry of catalogue) {
    const evidence = geometricEvidence(entry, query);
    if (!eligible(evidence)) continue;
    const previous = products.get(entry.productId);
    if (
      !previous ||
      evidence.inliers > previous.inliers ||
      (evidence.inliers === previous.inliers &&
        (evidence.inlierFraction > previous.inlierFraction ||
          (evidence.inlierFraction === previous.inlierFraction &&
            evidence.referenceId < previous.referenceId)))
    )
      products.set(entry.productId, evidence);
  }
  const candidates = [...products];
  if (!candidates.length) return { ...metadata, status: "unknown", reason: "no_geometric_match" };
  if (candidates.length > 1)
    return { ...metadata, status: "ambiguous", productIds: candidates.map(([id]) => id).sort() };
  const candidate = candidates[0];
  if (!candidate) return { ...metadata, status: "unknown", reason: "no_geometric_match" };
  return { ...metadata, status: "candidate", productId: candidate[0], evidence: candidate[1] };
}
