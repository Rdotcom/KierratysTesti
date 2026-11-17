import { z } from "zod";
import { PackagingModelSourceSchema } from "./packaging-classifier";

export const localVisionReadinessSchemaVersion = "local-vision-readiness-v1" as const;
const schemaVersion = z.literal(localVisionReadinessSchemaVersion);
const evidence = z.literal("integrity_and_interface_only");

const FullReadinessSchema = PackagingModelSourceSchema.extend({
  schemaVersion,
  status: z.literal("full"),
  evidence,
});
const NativePrimaryReadinessSchema = z
  .object({
    schemaVersion,
    status: z.literal("primary_only"),
    reason: z.enum(["unsupported_model_platform", "model_unavailable", "android_local"]),
    evidence,
  })
  .strict();
const NativeUnavailableReadinessSchema = z
  .object({
    schemaVersion,
    status: z.literal("unavailable"),
    reason: z.enum(["primary_unavailable", "busy", "timeout", "processing_failed"]),
  })
  .strict();

/** A no-image native integrity/interface snapshot, never inference accuracy. */
export const NativeLocalVisionReadinessSchema = z.discriminatedUnion("status", [
  FullReadinessSchema,
  NativePrimaryReadinessSchema,
  NativeUnavailableReadinessSchema,
]);
export type NativeLocalVisionReadiness = z.infer<typeof NativeLocalVisionReadinessSchema>;

/** Only the legacy recognize entry is known; this does not prove its supplement absent. */
const LegacyReadinessSchema = z
  .object({
    schemaVersion,
    status: z.literal("primary_only"),
    reason: z.literal("legacy_not_reported"),
    evidence: z.literal("not_reported"),
  })
  .strict();
const ClientUnavailableReadinessSchema = z
  .object({
    schemaVersion,
    status: z.literal("unavailable"),
    reason: z.enum([
      "unsupported_platform",
      "native_unavailable",
      "primary_unavailable",
      "busy",
      "timeout",
      "cancelled",
      "invalid_response",
      "processing_failed",
    ]),
  })
  .strict();
export const LocalVisionReadinessSchema = z.union([
  NativeLocalVisionReadinessSchema,
  LegacyReadinessSchema,
  ClientUnavailableReadinessSchema,
]);
export type LocalVisionReadiness = z.infer<typeof LocalVisionReadinessSchema>;

/** External native payloads cannot self-report the client's synthetic legacy state. */
export function normalizeLocalVisionReadiness(input: unknown): LocalVisionReadiness {
  const result = NativeLocalVisionReadinessSchema.safeParse(input);
  return result.success
    ? result.data
    : {
        schemaVersion: localVisionReadinessSchemaVersion,
        status: "unavailable",
        reason: "invalid_response",
      };
}
