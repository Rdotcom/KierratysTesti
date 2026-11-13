import { z } from "zod";

/** Experimental retrieval arithmetic, not an image encoder or identity proof.
 * Hashes below are caller assertions until bound to actual bytes by a runtime.
 * Deliberately never consumed by the shipping app or sorting policy. */
export const REFERENCE_EMBEDDING_VERSION = "reference-cosine-retrieval-v1" as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const vector = z.array(z.number().finite()).length(512);
const identity = {
  encoderSha256: hash,
  preprocessingSha256: hash,
  catalogueSha256: hash,
};
const gallerySchema = z.strictObject({
  ...identity,
  // Engineering gates must be registered before evaluation, not tuned on queries.
  minimumCosine: z.number().finite().min(0).max(1),
  minimumMargin: z.number().finite().gt(0).max(1),
  references: z
    .array(z.strictObject({ referenceId: token, productId: token, imageSha256: hash, vector }))
    .min(1)
    .max(32),
});
const querySchema = z.strictObject({ ...identity, imageSha256: hash, vector });
export type ReferenceEmbeddingResult = {
  algorithmVersion: typeof REFERENCE_EMBEDDING_VERSION;
  integrationAllowed: false;
  verificationStatus: "inferred";
  confidence: "uncalibrated_visual_similarity";
} & (
  | { status: "invalid"; reason: "invalid_query" | "identity_mismatch" | "enrollment_image" }
  | { status: "unknown"; reason: "below_similarity_gate" }
  | { status: "ambiguous"; productIds: readonly string[] }
  | {
      status: "candidate";
      productId: string;
      referenceId: string;
      referenceImageSha256: string;
      queryImageSha256: string;
      encoderSha256: string;
      preprocessingSha256: string;
      catalogueSha256: string;
      cosine: number;
      competitorCosine: number | null;
    }
);
const metadata = {
  algorithmVersion: REFERENCE_EMBEDDING_VERSION,
  integrationAllowed: false,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
} as const;

/** Scale first: ordinary sum-of-squares overflows/underflows for finite inputs. */
function unit(values: readonly number[]): number[] | null {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return null;
  const scaled = values.map((value) => value / scale);
  const norm = Math.sqrt(scaled.reduce((sum, value) => sum + value * value, 0));
  return scaled.map((value) => value / norm);
}

function parse(serialized: unknown, limit: number): unknown {
  if (typeof serialized !== "string" || serialized.length > limit) return undefined;
  try {
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

/** Copies a bounded serialized gallery; no caller getters/iterators/model code.
 * Same-image rejection is leakage prevention, not proof of capture independence.
 */
export function createReferenceEmbeddingIndex(
  serialized: unknown,
):
  | { status: "invalid" }
  | { status: "ready"; compare: (query: unknown) => ReferenceEmbeddingResult } {
  const parsed = gallerySchema.safeParse(parse(serialized, 524288));
  if (!parsed.success) return { status: "invalid" };
  const gallery = parsed.data;
  const ids = new Set<string>(),
    images = new Set<string>();
  const entries: { referenceId: string; productId: string; imageSha256: string; unit: number[] }[] =
    [];
  for (const row of gallery.references) {
    const normalized = unit(row.vector);
    if (!normalized || ids.has(row.referenceId) || images.has(row.imageSha256))
      return { status: "invalid" };
    ids.add(row.referenceId);
    images.add(row.imageSha256);
    entries.push({ ...row, unit: normalized });
  }
  return {
    status: "ready",
    compare(serializedQuery) {
      const result = querySchema.safeParse(parse(serializedQuery, 32768));
      if (!result.success) return { ...metadata, status: "invalid", reason: "invalid_query" };
      const query = result.data,
        normalized = unit(query.vector);
      if (!normalized) return { ...metadata, status: "invalid", reason: "invalid_query" };
      if (
        query.encoderSha256 !== gallery.encoderSha256 ||
        query.preprocessingSha256 !== gallery.preprocessingSha256 ||
        query.catalogueSha256 !== gallery.catalogueSha256
      )
        return { ...metadata, status: "invalid", reason: "identity_mismatch" };
      if (images.has(query.imageSha256))
        return { ...metadata, status: "invalid", reason: "enrollment_image" };
      const byProduct = new Map<string, { entry: (typeof entries)[number]; cosine: number }>();
      for (const entry of entries) {
        const cosine = Math.max(
          -1,
          Math.min(
            1,
            entry.unit.reduce((sum, value, index) => sum + value * (normalized[index] ?? 0), 0),
          ),
        );
        const previous = byProduct.get(entry.productId);
        if (
          !previous ||
          cosine > previous.cosine ||
          (cosine === previous.cosine && entry.referenceId < previous.entry.referenceId)
        )
          byProduct.set(entry.productId, { entry, cosine });
      }
      const ranked = [...byProduct.values()].sort(
        (a, b) => b.cosine - a.cosine || (a.entry.productId < b.entry.productId ? -1 : 1),
      );
      const best = ranked[0];
      if (!best || best.cosine < gallery.minimumCosine)
        return { ...metadata, status: "unknown", reason: "below_similarity_gate" };
      // A competitor slightly below the absolute gate can still destroy margin.
      const rivals = ranked.filter((row) => best.cosine - row.cosine < gallery.minimumMargin);
      if (rivals.length > 1)
        return {
          ...metadata,
          status: "ambiguous",
          productIds: rivals.map((row) => row.entry.productId).sort(),
        };
      return {
        ...metadata,
        status: "candidate",
        productId: best.entry.productId,
        referenceId: best.entry.referenceId,
        referenceImageSha256: best.entry.imageSha256,
        queryImageSha256: query.imageSha256,
        encoderSha256: gallery.encoderSha256,
        preprocessingSha256: gallery.preprocessingSha256,
        catalogueSha256: gallery.catalogueSha256,
        cosine: best.cosine,
        competitorCosine: ranked[1]?.cosine ?? null,
      };
    },
  };
}
