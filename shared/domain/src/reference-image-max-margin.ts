import { createCalibratedReferenceIndex } from "./reference-image-calibrated";
import { createReferenceEmbeddingIndex } from "./reference-image-embedding";

export const MAX_MARGIN_REFERENCE_VERSION = "gallery-negative-midpoint-support-v1" as const;
export const MAX_MARGIN_REFERENCE_POLICY = Object.freeze({
  floor: 0.75,
  negativeGap: 0.05,
  competitorMargin: 0.08,
  minimumSupportingReferences: 2,
});
const metadata = {
  algorithmVersion: MAX_MARGIN_REFERENCE_VERSION,
  integrationAllowed: false,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
} as const;
export type MaxMarginReferenceDecision = typeof metadata &
  (
    | { status: "invalid"; reason: string }
    | {
        status: "unknown";
        reason: "below_gate" | "inseparable_gallery" | "insufficient_reference_support";
      }
    | { status: "ambiguous"; productIds: readonly string[] }
    | {
        status: "candidate";
        productId: string;
        referenceId: string;
        queryImageSha256: string;
        referenceImageSha256: string;
        cosine: number;
        minimumCosine: number;
        supportingReferences: number;
      }
  );
function unit(values: readonly number[]): number[] {
  const scale = Math.max(...values.map(Math.abs)),
    scaled = values.map((v) => v / scale);
  const norm = Math.sqrt(scaled.reduce((sum, v) => sum + v * v, 0));
  return scaled.map((v) => v / norm);
}
/** Equal-distance scalar separator between the closest training negative and
 * least-similar positive gallery pair, plus floor/negative gap and two-view
 * corroboration. Statistics use NO evaluation/query labels. Not a probability. */
export function createMaxMarginReferenceIndex(serialized: unknown) {
  const statistics = createCalibratedReferenceIndex(serialized);
  if (statistics.status !== "ready") return { status: "invalid" } as const;
  // The prior strict validator owns a snapshot of this immutable JSON string.
  const input = JSON.parse(serialized as string) as {
    encoderSha256: string;
    preprocessingSha256: string;
    catalogueSha256: string;
    references: { productId: string; referenceId: string; imageSha256: string; vector: number[] }[];
  };
  const calibration = Object.freeze(
    statistics.calibration.map((row) =>
      Object.freeze({
        ...row,
        minimumCosine: Math.max(
          0.75,
          (row.galleryMinimum + row.maximumNegative) / 2,
          row.maximumNegative + 0.05,
        ),
      }),
    ),
  );
  const minimumCosine = Math.min(1, ...calibration.map((row) => row.minimumCosine));
  const raw = createReferenceEmbeddingIndex(
    JSON.stringify({
      encoderSha256: input.encoderSha256,
      preprocessingSha256: input.preprocessingSha256,
      catalogueSha256: input.catalogueSha256,
      references: input.references,
      minimumCosine,
      minimumMargin: 0.08,
    }),
  );
  if (raw.status !== "ready") return { status: "invalid" } as const;
  const references = input.references.map((row) => ({ ...row, vector: unit(row.vector) }));
  return {
    status: "ready",
    calibration,
    compare(query: unknown): MaxMarginReferenceDecision {
      const checked = statistics.compare(query);
      if (checked.status === "invalid")
        return { ...metadata, status: "invalid", reason: checked.reason };
      const result = raw.compare(query);
      if (result.status === "invalid")
        return { ...metadata, status: "invalid", reason: result.reason };
      if (result.status === "unknown")
        return { ...metadata, status: "unknown", reason: "below_gate" };
      if (result.status === "ambiguous")
        return { ...metadata, status: "ambiguous", productIds: result.productIds };
      const gate = calibration.find((row) => row.productId === result.productId);
      if (!gate?.enabled) return { ...metadata, status: "unknown", reason: "inseparable_gallery" };
      if (result.cosine < gate.minimumCosine)
        return { ...metadata, status: "unknown", reason: "below_gate" };
      const q = JSON.parse(query as string) as { vector: number[] },
        normalized = unit(q.vector);
      const support = references.filter(
        (row) =>
          row.productId === result.productId &&
          row.vector.reduce((sum, v, i) => sum + v * (normalized[i] ?? 0), 0) >= gate.minimumCosine,
      ).length;
      if (support < 2)
        return { ...metadata, status: "unknown", reason: "insufficient_reference_support" };
      return {
        ...metadata,
        status: "candidate",
        productId: result.productId,
        referenceId: result.referenceId,
        queryImageSha256: result.queryImageSha256,
        referenceImageSha256: result.referenceImageSha256,
        cosine: result.cosine,
        minimumCosine: gate.minimumCosine,
        supportingReferences: support,
      };
    },
  } as const;
}
