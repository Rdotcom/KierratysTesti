import {
  ConfidenceAssessmentSchema,
  LanguageSchema,
  LocalizedTextSchema,
  PackagingComponentObservationSchema,
  WebUrlSchema,
} from "@kierratysappi/domain";
import { z } from "zod";

export const DestinationIdSchema = z.enum([
  "deposit_return",
  "plastic_packaging",
  "carton_packaging",
  "glass_packaging",
  "metal_collection",
]);
export type DestinationId = z.infer<typeof DestinationIdSchema>;

export const SortingRuleReferenceSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  jurisdiction: z.literal("FI"),
  sourceName: z.string().min(1),
  sourceUrl: WebUrlSchema,
  checkedAt: z.iso.date(),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().optional(),
  verificationStatus: z.literal("verified"),
});
export type SortingRuleReference = z.infer<typeof SortingRuleReferenceSchema>;

export const SortingTraceSchema = z.object({
  evaluatedBranches: z.array(z.string().min(1)),
  matchedBranch: z.string().min(1).optional(),
  decisiveFields: z.array(z.string().min(1)),
});
export type SortingTrace = z.infer<typeof SortingTraceSchema>;

const SortingBaseSchema = z.object({
  componentId: z.string().min(1),
  confidence: ConfidenceAssessmentSchema,
  trace: SortingTraceSchema,
});

export const ResolvedSortingResultSchema = SortingBaseSchema.extend({
  status: z.literal("resolved"),
  destination: z.object({
    id: DestinationIdSchema,
    label: LocalizedTextSchema,
  }),
  preparation: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
  exceptions: z.array(LocalizedTextSchema),
  rule: SortingRuleReferenceSchema,
});

export const AmbiguousSortingResultSchema = SortingBaseSchema.extend({
  status: z.literal("ambiguous"),
  reason: z.enum(["deposit_status_unknown", "glass_shape_unknown", "conflicting_rules"]),
  question: LocalizedTextSchema,
  candidateDestinations: z.array(DestinationIdSchema).min(1),
  sources: z.array(SortingRuleReferenceSchema).min(1),
});

export const UnknownSortingResultSchema = SortingBaseSchema.extend({
  status: z.literal("unknown"),
  reason: z.enum([
    "not_packaging",
    "packaging_status_unknown",
    "material_missing",
    "unsupported_material",
    "hazardous_or_pressurized",
    "no_effective_rule",
  ]),
  nextAction: LocalizedTextSchema,
  sources: z.array(SortingRuleReferenceSchema),
});

export const SortingResultSchema = z.discriminatedUnion("status", [
  ResolvedSortingResultSchema,
  AmbiguousSortingResultSchema,
  UnknownSortingResultSchema,
]);
export type SortingResult = z.infer<typeof SortingResultSchema>;

export const SortingContextSchema = z.object({
  country: z.literal("FI"),
  language: LanguageSchema,
  evaluatedAt: z.iso.datetime(),
});
export type SortingContext = z.infer<typeof SortingContextSchema>;

export const SortingRequestSchema = z.object({
  component: PackagingComponentObservationSchema,
  context: SortingContextSchema,
});
export type SortingRequest = z.infer<typeof SortingRequestSchema>;
