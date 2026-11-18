import { z } from "zod";
import { GtinSchema } from "./gtin";
import { WebUrlSchema } from "./web-url";

export const LanguageSchema = z.enum(["fi", "en"]);
export type Language = z.infer<typeof LanguageSchema>;

export const LocalizedTextSchema = z.object({
  fi: z.string().min(1),
  en: z.string().min(1),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const VerificationStatusSchema = z.enum([
  "verified",
  "manufacturer",
  "community",
  "user_confirmed",
  "inferred",
  "mock",
  "unknown",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const SourceLicenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: WebUrlSchema.optional(),
  attributionText: z.string().min(1),
  shareAlike: z.boolean(),
});
export type SourceLicense = z.infer<typeof SourceLicenseSchema>;

export const FieldProvenanceSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceRecordId: z.string().min(1),
  // Internal user-selection evidence is provenance, never an external link.
  sourceUrl: WebUrlSchema.or(
    z.enum([
      "https://kierratysappi.local/object-selection",
      "https://kierratysappi.local/material-code-observation",
    ]),
  ),
  retrievedAt: z.iso.datetime(),
  lastConfirmedAt: z.iso.datetime().optional(),
  confidence: z.number().min(0).max(1),
  verificationStatus: VerificationStatusSchema,
  license: SourceLicenseSchema,
});
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

export function observedFieldSchema<TSchema extends z.ZodType>(valueSchema: TSchema) {
  return z.object({
    value: valueSchema,
    provenance: FieldProvenanceSchema,
  });
}

export type ObservedField<TValue> = {
  readonly value: TValue;
  readonly provenance: FieldProvenance;
};

export const PackagingStatusSchema = z.enum(["packaging", "non_packaging", "unknown"]);
export type PackagingStatus = z.infer<typeof PackagingStatusSchema>;

export const PackagingCompletenessSchema = z.enum(["complete", "partial", "unknown"]);
export type PackagingCompleteness = z.infer<typeof PackagingCompletenessSchema>;

export const MaterialFamilySchema = z.enum([
  "plastic",
  "carton",
  "paper",
  "glass",
  "metal",
  "wood",
  "composite",
  "other",
  "unknown",
]);
export type MaterialFamily = z.infer<typeof MaterialFamilySchema>;

export const PackagingShapeSchema = z.enum([
  "bottle",
  "can",
  "jar",
  "box",
  "carton",
  "bag",
  "wrap",
  "tray",
  "cup",
  "cap",
  "lid",
  "pump",
  "tube",
  "other",
  "unknown",
]);
export type PackagingShape = z.infer<typeof PackagingShapeSchema>;

export const DepositReturnStatusSchema = z.enum(["yes", "no", "not_applicable", "unknown"]);
export type DepositReturnStatus = z.infer<typeof DepositReturnStatusSchema>;

export const ComponentConditionsSchema = z.object({
  hazardousResidue: z.enum(["yes", "no", "unknown"]).default("unknown"),
  pressurized: z.enum(["yes", "no", "unknown"]).default("unknown"),
  emptied: z.enum(["yes", "no", "unknown"]).default("unknown"),
});
export type ComponentConditions = z.infer<typeof ComponentConditionsSchema>;

const ObservedStringSchema = observedFieldSchema(z.string().min(1));
const ObservedPackagingStatusSchema = observedFieldSchema(PackagingStatusSchema);
const ObservedMaterialFamilySchema = observedFieldSchema(MaterialFamilySchema);
const ObservedShapeSchema = observedFieldSchema(PackagingShapeSchema);
const ObservedDepositStatusSchema = observedFieldSchema(DepositReturnStatusSchema);

export const PackagingComponentObservationSchema = z.object({
  id: z.string().min(1),
  displayName: ObservedStringSchema.optional(),
  packagingStatus: ObservedPackagingStatusSchema,
  materialFamily: ObservedMaterialFamilySchema.optional(),
  materialCode: ObservedStringSchema.optional(),
  shape: ObservedShapeSchema.optional(),
  depositReturnStatus: ObservedDepositStatusSchema.optional(),
  detachable: observedFieldSchema(z.boolean()).optional(),
  conditions: ComponentConditionsSchema.default({
    hazardousResidue: "unknown",
    pressurized: "unknown",
    emptied: "unknown",
  }),
});
export type PackagingComponentObservation = z.infer<typeof PackagingComponentObservationSchema>;

export const ProductObservationSchema = z.object({
  gtin: GtinSchema,
  name: ObservedStringSchema.optional(),
  brands: observedFieldSchema(z.array(z.string().min(1))).optional(),
  imageUrl: observedFieldSchema(WebUrlSchema).optional(),
  packagingCompleteness: observedFieldSchema(PackagingCompletenessSchema),
  packagingComponents: z.array(PackagingComponentObservationSchema),
});
export type ProductObservation = z.infer<typeof ProductObservationSchema>;

export const ProviderErrorCodeSchema = z.enum(["rate_limited", "unavailable", "invalid_response"]);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export const ProviderProductResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("found"), product: ProductObservationSchema }),
  z.object({ status: z.literal("not_found") }),
  z.object({
    status: z.literal("error"),
    code: ProviderErrorCodeSchema,
    retryable: z.boolean(),
  }),
]);
export type ProviderProductResult = z.infer<typeof ProviderProductResultSchema>;
