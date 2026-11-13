import { z } from "zod";

/** Original experimental gallery/negative-calibrated retrieval. Threshold
 * calibration is engineering separation, NOT probability or identity review. */
export const CALIBRATED_REFERENCE_VERSION = "gallery-negative-cosine-v1" as const;
export const CALIBRATED_REFERENCE_POLICY = Object.freeze({
  floor: 0.75,
  galleryAllowance: 0.02,
  negativeGap: 0.05,
  competitorMargin: 0.08,
});
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const vector = z.array(z.number().finite()).length(512);
const identity = { encoderSha256: hash, preprocessingSha256: hash, catalogueSha256: hash };
const schema = z.strictObject({
  ...identity,
  references: z
    .array(z.strictObject({ referenceId: token, productId: token, imageSha256: hash, vector }))
    .min(2)
    .max(32),
  negatives: z
    .array(z.strictObject({ imageSha256: hash, vector }))
    .min(1)
    .max(72),
});
const querySchema = z.strictObject({ ...identity, imageSha256: hash, vector });
const metadata = {
  algorithmVersion: CALIBRATED_REFERENCE_VERSION,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  integrationAllowed: false,
} as const;
export type CalibratedReferenceDecision = typeof metadata &
  (
    | { status: "invalid"; reason: "invalid_query" | "identity_mismatch" | "training_image" }
    | { status: "unknown"; reason: "below_calibrated_gate" | "inseparable_gallery" }
    | { status: "ambiguous"; productIds: readonly string[] }
    | {
        status: "candidate";
        productId: string;
        referenceId: string;
        cosine: number;
        minimumCosine: number;
        competitorCosine: number | null;
        queryImageSha256: string;
        referenceImageSha256: string;
      }
  );
export interface ReferenceCalibration {
  readonly productId: string;
  readonly galleryMinimum: number;
  readonly maximumNegative: number;
  readonly minimumCosine: number;
  readonly enabled: boolean;
}
function parse(value: unknown, maximum: number): unknown {
  if (typeof value !== "string" || value.length > maximum) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
function unit(values: readonly number[]): number[] | null {
  const scale = Math.max(...values.map(Math.abs));
  if (!scale) return null;
  const scaled = values.map((value) => value / scale);
  const norm = Math.sqrt(scaled.reduce((sum, value) => sum + value * value, 0));
  return scaled.map((value) => value / norm);
}
const dot = (a: readonly number[], b: readonly number[]) =>
  Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0),
    ),
  );

/** No query vectors/labels are accepted during fitting. Inputs and negative
 * membership must be bound to trusted runtime/source receipts independently. */
export function createCalibratedReferenceIndex(serialized: unknown):
  | { status: "invalid" }
  | {
      status: "ready";
      calibration: readonly ReferenceCalibration[];
      compare: (query: unknown) => CalibratedReferenceDecision;
    } {
  const parsed = schema.safeParse(parse(serialized, 2_097_152));
  if (!parsed.success) return { status: "invalid" };
  const input = parsed.data,
    ids = new Set<string>(),
    images = new Set<string>();
  const refs: { productId: string; referenceId: string; imageSha256: string; vector: number[] }[] =
    [];
  for (const row of input.references) {
    const normalized = unit(row.vector);
    if (!normalized || ids.has(row.referenceId) || images.has(row.imageSha256))
      return { status: "invalid" };
    ids.add(row.referenceId);
    images.add(row.imageSha256);
    refs.push({ ...row, vector: normalized });
  }
  const negatives: number[][] = [];
  for (const row of input.negatives) {
    const normalized = unit(row.vector);
    if (!normalized || images.has(row.imageSha256)) return { status: "invalid" };
    images.add(row.imageSha256);
    negatives.push(normalized);
  }
  const products = [...new Set(refs.map((row) => row.productId))].sort();
  const calibration: ReferenceCalibration[] = [];
  for (const productId of products) {
    const own = refs.filter((row) => row.productId === productId);
    if (own.length < 2) return { status: "invalid" };
    let galleryMinimum = 1,
      maximumNegative = -1;
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++)
        galleryMinimum = Math.min(galleryMinimum, dot(own[i]?.vector ?? [], own[j]?.vector ?? []));
    for (const negative of negatives)
      for (const reference of own)
        maximumNegative = Math.max(maximumNegative, dot(reference.vector, negative));
    const minimumCosine = Math.max(
      CALIBRATED_REFERENCE_POLICY.floor,
      galleryMinimum - CALIBRATED_REFERENCE_POLICY.galleryAllowance,
      maximumNegative + CALIBRATED_REFERENCE_POLICY.negativeGap,
    );
    calibration.push(
      Object.freeze({
        productId,
        galleryMinimum,
        maximumNegative,
        minimumCosine,
        enabled:
          minimumCosine <= 1 &&
          maximumNegative + CALIBRATED_REFERENCE_POLICY.negativeGap <= galleryMinimum,
      }),
    );
  }
  const frozen = Object.freeze(calibration);
  return {
    status: "ready",
    calibration: frozen,
    compare(serializedQuery) {
      const parsedQuery = querySchema.safeParse(parse(serializedQuery, 32768));
      if (!parsedQuery.success) return { ...metadata, status: "invalid", reason: "invalid_query" };
      const query = parsedQuery.data,
        normalized = unit(query.vector);
      if (!normalized) return { ...metadata, status: "invalid", reason: "invalid_query" };
      if (
        Object.keys(identity).some(
          (key) => query[key as keyof typeof identity] !== input[key as keyof typeof identity],
        )
      )
        return { ...metadata, status: "invalid", reason: "identity_mismatch" };
      if (images.has(query.imageSha256))
        return { ...metadata, status: "invalid", reason: "training_image" };
      const ranked = products
        .map((productId) => {
          const own = refs
            .filter((row) => row.productId === productId)
            .map((row) => ({ row, cosine: dot(row.vector, normalized) }))
            .sort(
              (a, b) => b.cosine - a.cosine || (a.row.referenceId < b.row.referenceId ? -1 : 1),
            );
          return own[0];
        })
        .filter((row): row is NonNullable<typeof row> => row !== undefined)
        .sort((a, b) => b.cosine - a.cosine || (a.row.productId < b.row.productId ? -1 : 1));
      const best = ranked[0],
        gate = frozen.find((row) => row.productId === best?.row.productId);
      // Never rescue a second-ranked class when the leading class is disabled.
      if (!best || !gate?.enabled)
        return { ...metadata, status: "unknown", reason: "inseparable_gallery" };
      if (best.cosine < gate.minimumCosine)
        return { ...metadata, status: "unknown", reason: "below_calibrated_gate" };
      const rivals = ranked.filter(
        (row) => best.cosine - row.cosine < CALIBRATED_REFERENCE_POLICY.competitorMargin,
      );
      if (rivals.length > 1)
        return {
          ...metadata,
          status: "ambiguous",
          productIds: rivals.map((row) => row.row.productId).sort(),
        };
      return {
        ...metadata,
        status: "candidate",
        productId: best.row.productId,
        referenceId: best.row.referenceId,
        referenceImageSha256: best.row.imageSha256,
        queryImageSha256: query.imageSha256,
        cosine: best.cosine,
        minimumCosine: gate.minimumCosine,
        competitorCosine: ranked[1]?.cosine ?? null,
      };
    },
  };
}
