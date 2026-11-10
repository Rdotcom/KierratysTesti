import {
  REFERENCE_FEATURE_VERSION,
  type ReferenceImageFeatures,
  type ReferenceKeypoint,
} from "./reference-image-features";

/** Own implementation of binary-feature correspondence and affine consensus.
 * These engineering gates are not calibrated identity probabilities.
 * No model, product database, material or sorting policy is embedded here.
 */
export const REFERENCE_MATCHER_VERSION = "reference-affine-v1" as const;
export const REFERENCE_MATCH_POLICY = Object.freeze({
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
});

export interface ReferenceCatalogueEntry {
  productId: string;
  referenceId: string;
  /** Caller must bind descriptors to the decoded source bytes independently. */
  imageSha256: string;
  features: ReferenceImageFeatures;
}

export interface ReferenceMatchEvidence {
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
  algorithmVersion: typeof REFERENCE_MATCHER_VERSION;
  featureVersion: typeof REFERENCE_FEATURE_VERSION;
  verificationStatus: "inferred";
  confidence: "uncalibrated_visual_similarity";
}

export type ReferenceMatchResult = MatchMetadata &
  (
    | { status: "candidate"; productId: string; evidence: ReferenceMatchEvidence }
    | { status: "ambiguous"; productIds: string[] }
    | {
        status: "unknown";
        reason: "empty_catalogue" | "low_detail" | "no_geometric_match";
      }
    | { status: "invalid"; reason: "invalid_query" | "invalid_catalogue" }
  );

const metadata: MatchMetadata = Object.freeze({
  algorithmVersion: REFERENCE_MATCHER_VERSION,
  featureVersion: REFERENCE_FEATURE_VERSION,
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
function readFeatures(value: unknown): ReferenceImageFeatures | null {
  if (!isRecord(value)) return null;
  const { version, width, height, keypoints } = value;
  const pointCount = Array.isArray(keypoints) ? keypoints.length : -1;
  if (
    version !== REFERENCE_FEATURE_VERSION ||
    !bounded(width, 32, 256) ||
    !Number.isInteger(width) ||
    !bounded(height, 32, 256) ||
    !Number.isInteger(height) ||
    !Array.isArray(keypoints) ||
    !Number.isInteger(pointCount) ||
    pointCount < 0 ||
    pointCount > REFERENCE_MATCH_POLICY.maximumKeypoints
  )
    return null;
  const copied: ReferenceKeypoint[] = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const point = keypoints[pointIndex];
    if (!isRecord(point)) return null;
    const { x, y, descriptor } = point;
    if (!bounded(x, 0, 1) || !bounded(y, 0, 1) || !Array.isArray(descriptor)) return null;
    if (descriptor.length !== 8) return null;
    const words: number[] = [];
    for (let wordIndex = 0; wordIndex < 8; wordIndex++) {
      const word = descriptor[wordIndex];
      if (!bounded(word, 0, 0xffff_ffff) || !Number.isInteger(word)) return null;
      words.push(word);
    }
    copied.push({ x, y, descriptor: words });
  }
  return { version, width, height, keypoints: copied };
}

function readCatalogue(value: unknown): ReferenceCatalogueEntry[] | null {
  if (!Array.isArray(value)) return null;
  const count = value.length;
  if (!Number.isInteger(count) || count < 0 || count > REFERENCE_MATCH_POLICY.maximumReferences)
    return null;
  const entries: ReferenceCatalogueEntry[] = [];
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

function distance(a: ReferenceKeypoint, b: ReferenceKeypoint): number {
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
function nearest(from: ReferenceKeypoint, points: readonly ReferenceKeypoint[]): Nearest {
  let best = 257;
  let second = 257;
  let index = -1;
  for (const [candidate, point] of points.entries()) {
    const current = distance(from, point);
    if (current < best) {
      second = best;
      best = current;
      index = candidate;
    } else if (current < second) second = current;
  }
  return { index, best, second };
}
function distinctive(value: Nearest): boolean {
  return (
    value.index >= 0 &&
    value.best <= REFERENCE_MATCH_POLICY.maximumHammingDistance &&
    value.best <= REFERENCE_MATCH_POLICY.nearestRatio * value.second &&
    value.second - value.best >= REFERENCE_MATCH_POLICY.minimumDistanceGap
  );
}

interface Pair {
  reference: ReferenceKeypoint;
  query: ReferenceKeypoint;
  distance: number;
}
function correspondences(reference: ReferenceImageFeatures, query: ReferenceImageFeatures): Pair[] {
  const forward = reference.keypoints.map((point) => nearest(point, query.keypoints));
  const backward = query.keypoints.map((point) => nearest(point, reference.keypoints));
  const pairs: Pair[] = [];
  for (const [index, value] of forward.entries()) {
    const reverse = backward[value.index];
    const referencePoint = reference.keypoints[index];
    const queryPoint = query.keypoints[value.index];
    if (
      distinctive(value) &&
      reverse &&
      distinctive(reverse) &&
      reverse.index === index &&
      referencePoint &&
      queryPoint
    )
      pairs.push({ reference: referencePoint, query: queryPoint, distance: value.best });
  }
  return pairs.sort((a, b) => a.distance - b.distance);
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
    REFERENCE_MATCH_POLICY.maximumReprojectionError
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
  entry: ReferenceCatalogueEntry,
  query: ReferenceImageFeatures,
): ReferenceMatchEvidence {
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
  if (pairs.length >= REFERENCE_MATCH_POLICY.minimumInliers) {
    // Fixed budget/seed, independent of any product name, data label or outcome.
    for (let attempt = 0; attempt < REFERENCE_MATCH_POLICY.maximumAffineHypotheses; attempt++) {
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
const eligible = (value: ReferenceMatchEvidence) =>
  value.inliers >= REFERENCE_MATCH_POLICY.minimumInliers &&
  value.inlierFraction >= REFERENCE_MATCH_POLICY.minimumInlierFraction &&
  value.referenceCoverage >= REFERENCE_MATCH_POLICY.minimumCoverage &&
  value.queryCoverage >= REFERENCE_MATCH_POLICY.minimumCoverage;

/** Offline candidate retrieval only. Callers may not treat this as verified
 * product identity, barcode, material, safety or a recycling destination.
 * The catalogue must already have separately reviewed identity/rights provenance.
 */
export function matchReferenceImage(
  queryInput: unknown,
  catalogueInput: unknown,
): ReferenceMatchResult {
  let query: ReferenceImageFeatures | null;
  try {
    query = readFeatures(queryInput);
  } catch {
    query = null;
  }
  if (!query) return { ...metadata, status: "invalid", reason: "invalid_query" };
  let catalogue: ReferenceCatalogueEntry[] | null;
  try {
    catalogue = readCatalogue(catalogueInput);
  } catch {
    catalogue = null;
  }
  if (!catalogue) return { ...metadata, status: "invalid", reason: "invalid_catalogue" };
  if (!catalogue.length) return { ...metadata, status: "unknown", reason: "empty_catalogue" };
  if (query.keypoints.length < 8) return { ...metadata, status: "unknown", reason: "low_detail" };
  const products = new Map<string, ReferenceMatchEvidence>();
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
