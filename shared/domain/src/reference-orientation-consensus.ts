import { z } from "zod";

export const REFERENCE_ORIENTATION_VERSION = "four-orientation-consensus-v1" as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const schema = z.strictObject({
  originalImageSha256: hash,
  catalogueSha256: hash,
  encoderSha256: hash,
  preprocessingSha256: hash,
  enrolledProductIds: z.array(token).min(1).max(16),
  views: z
    .array(
      z.strictObject({
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
        queryImageSha256: hash,
        catalogueSha256: hash,
        encoderSha256: hash,
        preprocessingSha256: hash,
        status: z.enum(["candidate", "ambiguous", "unknown", "unavailable", "invalid"]),
        productIds: z.array(token).max(16),
      }),
    )
    .length(4),
});
const metadata = {
  algorithmVersion: REFERENCE_ORIENTATION_VERSION,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  integrationAllowed: false,
} as const;
export type OrientationConsensus = typeof metadata & {
  status: "invalid" | "unavailable" | "unknown" | "ambiguous" | "candidate";
  productIds: readonly string[];
  supportingRotations: readonly number[];
  reason:
    | "invalid_evidence"
    | "required_view_failed"
    | "no_candidate"
    | "conflicting_views"
    | "consistent_candidate";
};

/** Same physical input at all four fixed rotations, each through the complete
 * unchanged byte-bound recognizer. Missing/failed/ambiguous views never become
 * a successful fallback. This function validates asserted receipts; a trusted
 * byte-transform/runtime wrapper must bind all derived views to the original.
 * No material, exact GTIN lookup, calibrated probability or activation grant. */
export function fuseReferenceOrientations(serialized: unknown): OrientationConsensus {
  const invalid = (): OrientationConsensus => ({
    ...metadata,
    status: "invalid",
    productIds: [],
    supportingRotations: [],
    reason: "invalid_evidence",
  });
  if (typeof serialized !== "string" || serialized.length > 32768) return invalid();
  try {
    const parsed = schema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return invalid();
    const input = parsed.data,
      enrolled = new Set(input.enrolledProductIds);
    if (
      enrolled.size !== input.enrolledProductIds.length ||
      new Set(input.views.map((v) => v.rotation)).size !== 4 ||
      new Set(input.views.map((v) => v.queryImageSha256)).size !== 4 ||
      input.views.find((v) => v.rotation === 0)?.queryImageSha256 !== input.originalImageSha256
    )
      return invalid();
    for (const v of input.views) {
      if (
        v.catalogueSha256 !== input.catalogueSha256 ||
        v.encoderSha256 !== input.encoderSha256 ||
        v.preprocessingSha256 !== input.preprocessingSha256 ||
        new Set(v.productIds).size !== v.productIds.length ||
        v.productIds.some((id) => !enrolled.has(id))
      )
        return invalid();
      if (
        (v.status === "candidate" && v.productIds.length !== 1) ||
        (v.status === "ambiguous" && v.productIds.length < 2) ||
        (["invalid", "unavailable", "unknown"].includes(v.status) && v.productIds.length)
      )
        return invalid();
    }
    if (input.views.some((v) => v.status === "invalid" || v.status === "unavailable"))
      return {
        ...metadata,
        status: "unavailable",
        productIds: [],
        supportingRotations: [],
        reason: "required_view_failed",
      };
    const ids = [...new Set(input.views.flatMap((v) => v.productIds))].sort();
    if (ids.length > 1 || input.views.some((v) => v.status === "ambiguous"))
      return {
        ...metadata,
        status: "ambiguous",
        productIds: ids,
        supportingRotations: [],
        reason: "conflicting_views",
      };
    if (!ids.length)
      return {
        ...metadata,
        status: "unknown",
        productIds: [],
        supportingRotations: [],
        reason: "no_candidate",
      };
    return {
      ...metadata,
      status: "candidate",
      productIds: ids,
      supportingRotations: input.views
        .filter((v) => v.status === "candidate")
        .map((v) => v.rotation)
        .sort((a, b) => a - b),
      reason: "consistent_candidate",
    };
  } catch {
    return invalid();
  }
}
