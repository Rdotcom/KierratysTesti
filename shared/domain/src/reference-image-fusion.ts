import { z } from "zod";

/** Experimental identity-only fusion. The evaluation/runtime must independently
 * bind these asserted summaries to actual same-image observations. Not sorting,
 * identity verification, a probability or permission for app integration. */
export const REFERENCE_FUSION_VERSION = "reference-embedding-pixel-veto-v1" as const;
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const lane = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("candidate"), productId: token }),
  z.strictObject({ status: z.literal("ambiguous"), productIds: z.array(token).min(2).max(16) }),
  z.strictObject({ status: z.literal("unknown") }),
  z.strictObject({ status: z.literal("unavailable") }),
]);
const schema = z.strictObject({
  pixelImageSha256: hash,
  embeddingImageSha256: hash,
  pixel: lane,
  embedding: lane,
  enrolledProductIds: z.array(token).min(1).max(16),
  quarantineGroups: z.array(z.array(token).min(2).max(16)).max(8),
});
export type FusedReferenceIdentity = {
  algorithmVersion: typeof REFERENCE_FUSION_VERSION;
  verificationStatus: "inferred";
  confidence: "uncalibrated_visual_similarity";
  integrationAllowed: false;
} & (
  | { status: "invalid"; reason: "invalid_evidence" }
  | { status: "unavailable"; reason: "required_lane_failed" }
  | { status: "unknown"; reason: "no_embedding_candidate" }
  | { status: "ambiguous"; productIds: readonly string[]; reason: "conflict_or_quarantine" }
  | { status: "candidate"; productId: string; reason: "agreement" | "embedding_recovery" }
);
const metadata = {
  algorithmVersion: REFERENCE_FUSION_VERSION,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  integrationAllowed: false,
} as const;

/** Pixel unknown may mean insufficient texture, not evidence against identity.
 * Only a gated embedding candidate may recover it. Pixel conflict/ambiguity and
 * known gallery-self confusion always veto; pixel-only candidates never recover
 * weak embeddings. No product-specific exceptions or query-label inputs. */
export function fuseReferenceIdentityEvidence(serialized: unknown): FusedReferenceIdentity {
  const invalid = (): FusedReferenceIdentity => ({
    ...metadata,
    status: "invalid",
    reason: "invalid_evidence",
  });
  if (typeof serialized !== "string" || serialized.length > 65536) return invalid();
  let input: z.infer<typeof schema>;
  try {
    const parsed = schema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return invalid();
    input = parsed.data;
  } catch {
    return invalid();
  }
  const { pixel, embedding, enrolledProductIds: enrolled, quarantineGroups: groups } = input;
  const ids = (value: z.infer<typeof lane>): string[] =>
    value.status === "candidate"
      ? [value.productId]
      : value.status === "ambiguous"
        ? value.productIds
        : [];
  const asserted = [...ids(pixel), ...ids(embedding)];
  if (
    input.pixelImageSha256 !== input.embeddingImageSha256 ||
    new Set(enrolled).size !== enrolled.length ||
    asserted.some((id) => !enrolled.includes(id)) ||
    [pixel, embedding].some(
      (value) =>
        value.status === "ambiguous" && new Set(value.productIds).size !== value.productIds.length,
    ) ||
    groups.some(
      (group) => new Set(group).size !== group.length || group.some((id) => !enrolled.includes(id)),
    ) ||
    new Set(groups.flat()).size !== groups.flat().length
  )
    return invalid();
  if (pixel.status === "unavailable" || embedding.status === "unavailable")
    return { ...metadata, status: "unavailable", reason: "required_lane_failed" };
  const conflicts = new Set(asserted);
  for (const group of groups)
    if (group.some((id) => conflicts.has(id))) for (const id of group) conflicts.add(id);
  if (pixel.status === "ambiguous" || embedding.status === "ambiguous" || conflicts.size > 1)
    return {
      ...metadata,
      status: "ambiguous",
      reason: "conflict_or_quarantine",
      productIds: [...conflicts].sort(),
    };
  if (embedding.status !== "candidate")
    return { ...metadata, status: "unknown", reason: "no_embedding_candidate" };
  return {
    ...metadata,
    status: "candidate",
    productId: embedding.productId,
    reason: pixel.status === "candidate" ? "agreement" : "embedding_recovery",
  };
}
