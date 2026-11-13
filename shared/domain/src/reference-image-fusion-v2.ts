import {
  type FusedReferenceIdentity,
  fuseReferenceIdentityEvidence,
} from "./reference-image-fusion";

export const REFERENCE_MONOTONE_FUSION_VERSION = "reference-monotone-fusion-v2" as const;
type Versioned<T> = T extends unknown
  ? Omit<T, "algorithmVersion"> & { algorithmVersion: typeof REFERENCE_MONOTONE_FUSION_VERSION }
  : never;
export type MonotoneReferenceIdentity =
  | Versioned<FusedReferenceIdentity>
  | (Omit<Versioned<Extract<FusedReferenceIdentity, { status: "candidate" }>>, "reason"> & {
      reason: "pixel_preserved";
    });

/** Mere abstention is absence of evidence, not a contradiction. Preserve a
 * validated, non-quarantined pixel candidate ONLY when embeddings are unknown.
 * All positive conflict, ambiguity, quarantine, invalid and failure gates remain
 * identical to v1. This is experimental inference, not verified identity. */
export function fuseMonotoneReferenceIdentityEvidence(
  serialized: unknown,
): MonotoneReferenceIdentity {
  const base = fuseReferenceIdentityEvidence(serialized);
  if (base.status === "unknown") {
    // v1 already strictly validated this immutable serialized JSON, same-image
    // binding, enrollment and quarantine. Do not add an unvalidated fallback.
    const input = JSON.parse(serialized as string) as {
      pixel: { status: string; productId?: string };
    };
    if (input.pixel.status === "candidate" && typeof input.pixel.productId === "string")
      return {
        ...base,
        algorithmVersion: REFERENCE_MONOTONE_FUSION_VERSION,
        status: "candidate",
        productId: input.pixel.productId,
        reason: "pixel_preserved",
      };
  }
  return { ...base, algorithmVersion: REFERENCE_MONOTONE_FUSION_VERSION };
}
