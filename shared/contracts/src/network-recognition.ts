import { z } from "zod";
import { maxPhotoBase64Length } from "./photo-recognition";

export const objectKinds = [
  "cup",
  "spoon",
  "fork",
  "knife",
  "bottle",
  "jar",
  "can",
  "carton",
  "bag",
  "battery",
  "phone",
  "textile",
  "multiple-cups",
  "spoon-and-fork",
  "other",
] as const;
export const networkModelId = "siglip2-server-onnx-weight-int8-v1";
export const networkConsentVersion = "self-hosted-image-v1";
export const networkRecognitionPath = "/v1/recycling/object-image";
export const networkCapabilitiesPath = "/v1/recycling/object-image-capabilities";
export const networkRevision = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2";
export const networkPreprocessing = "siglip2-server-pillow13-rgb-bilinear224-v1";
const kind = z.enum(objectKinds);
export const NetworkImageRequestSchema = z
  .object({
    jpegBase64: z.string().min(8).max(maxPhotoBase64Length),
    consentVersion: z.literal(networkConsentVersion),
  })
  .strict();
export const NetworkScoreSchema = z
  .array(z.object({ kind, similarity: z.number().finite().min(-1).max(1) }).strict())
  .length(objectKinds.length)
  .refine((rows) => rows.every((r, i) => r.kind === objectKinds[i]), "ordered_unique_classes");
export const NetworkObservationSchema = z
  .object({
    focus: z.enum(["single", "multiple", "unknown"]),
    candidates: z.array(kind).max(3),
    source: z
      .object({
        modelId: z.literal(networkModelId),
        revision: z.literal(networkRevision),
        preprocessing: z.literal(networkPreprocessing),
        checkedOn: z.literal("2026-11-16"),
        observedAt: z.iso.datetime(),
        verification: z.literal("unverified"),
        confidence: z.literal("uncalibrated"),
        scope: z.literal("object_form_only"),
        execution: z.literal("server"),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.candidates).size === v.candidates.length &&
      (v.focus === "single"
        ? v.candidates.length > 0 &&
          v.candidates.every((k) => !["other", "multiple-cups", "spoon-and-fork"].includes(k))
        : v.candidates.length === 0),
    "consistent_candidate_focus",
  );
export const NetworkFailureSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "disabled",
      "busy",
      "rate_limited",
      "invalid_image",
      "invalid_response",
      "timeout",
      "cancelled",
      "failed",
      "offline",
    ]),
  })
  .strict();
export const NetworkResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("observed"), observation: NetworkObservationSchema }).strict(),
  NetworkFailureSchema,
]);
export type NetworkResult = z.infer<typeof NetworkResultSchema>;
export const NetworkCapabilitiesSchema = z
  .object({
    enabled: z.boolean(),
    consentVersion: z.literal(networkConsentVersion),
    modelId: z.literal(networkModelId),
    execution: z.literal("server"),
    retention: z.literal("memory-only"),
    maxImageBytes: z.literal(1_500_000),
  })
  .strict();
/** Same rank/focus policy as local inference; these scores are not probabilities. */
export function observationFromScores(
  input: unknown,
  observedAt: string,
): z.infer<typeof NetworkObservationSchema> {
  const scores = NetworkScoreSchema.parse(input)
    .map((r, i) => ({ ...r, index: i }))
    .sort((a, b) => b.similarity - a.similarity || a.index - b.index);
  const first = scores[0]?.kind;
  const focus =
    first === "other"
      ? "unknown"
      : first === "multiple-cups" || first === "spoon-and-fork"
        ? "multiple"
        : "single";
  return NetworkObservationSchema.parse({
    focus,
    candidates:
      focus === "single"
        ? scores
            .filter((r) => !["other", "multiple-cups", "spoon-and-fork"].includes(r.kind))
            .slice(0, 3)
            .map((r) => r.kind)
        : [],
    source: {
      modelId: networkModelId,
      revision: networkRevision,
      preprocessing: networkPreprocessing,
      checkedOn: "2026-11-16",
      observedAt,
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
      execution: "server",
    },
  });
}
