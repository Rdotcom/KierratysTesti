import {
  MATERIAL_CODE_INPUT_MAX_LENGTH,
  type MaterialCodeParseResult,
  parseMaterialIdentificationCode,
} from "@kierratysappi/domain";
import { z } from "zod";
import {
  decidePackagingScores,
  NativePackagingSupplementSchema,
  packagingDeployedGate,
  packagingGateVersion,
  packagingGatePolicies,
  packagingPositiveGroups,
  PackagingModelSourceSchema,
} from "./packaging-classifier";

export const localVisionSchemaVersion = "local-vision-v4" as const;
export const localVisionNormalizerVersion = "local-vision-normalizer-v4" as const;
export const localVisionAbstentionVersion = "local-vision-abstention-v3" as const;
export const localVisionClassificationPolicy = "apple-class-operating-point-v1" as const;
/** Fixed OCR3/en-US/correction-enabled material-abbreviation lexicon, not material truth. */
export const localVisionOcrPolicy = "material-code-lexicon-v1" as const;

/** Fixed Apple class-curve query parameters, not measured application precision/recall. */
export const localVisionMinimumPrecision = 0.9;
export const localVisionMinimumRecall = 0.01;
export const localVisionSupportedIdentifiers = [
  "bottle",
  "wine_bottle",
  "jar",
  "carton",
  "cardboard_box",
  "paper_bag",
  "cup",
] as const;

const PlainLineSchema = z
  .string()
  .max(64)
  .regex(/^[^\p{Cc}\p{Cf}]*$/u);
const IdentifierSchema = z.enum(localVisionSupportedIdentifiers);
const NativeClassificationSchema = z
  .object({
    identifier: IdentifierSchema,
    score: z.number().finite().min(0).max(1),
    hasPrecisionRecallCurve: z.boolean(),
    passesOperatingPoint: z.boolean(),
  })
  .strict()
  .refine((value) => value.hasPrecisionRecallCurve || !value.passesOperatingPoint);
const RevisionSchema = z.union([z.literal(1), z.literal(2)]);
const OsVersionSchema = z
  .string()
  .max(32)
  .regex(/^\d{1,3}(?:\.\d{1,3}){0,2}$/u);
const OcrLanguagesSchema = z
  .array(
    z
      .string()
      .max(24)
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/u),
  )
  .min(1)
  .max(5)
  .refine((languages) => new Set(languages).size === languages.length);

/** The private native response is untrusted until this bounded boundary accepts it. */
const NativeLocalVisionBaseSchema = z
  .object({
    engine: z.literal("apple-vision"),
    classificationPolicy: z.literal(localVisionClassificationPolicy),
    minimumPrecision: z.literal(localVisionMinimumPrecision),
    minimumRecall: z.literal(localVisionMinimumRecall),
    classificationRevision: RevisionSchema,
    ocrRevision: z.literal(3),
    ocrLanguages: OcrLanguagesSchema,
    osVersion: OsVersionSchema,
    observedAt: z.iso.datetime(),
    classifications: z
      .array(NativeClassificationSchema)
      .length(localVisionSupportedIdentifiers.length)
      .refine(
        (values) =>
          new Set(values.map((value) => value.identifier)).size ===
          localVisionSupportedIdentifiers.length,
      ),
    textLines: z.array(PlainLineSchema).max(24),
    durationMs: z.number().finite().min(0).max(60_000),
  })
  .strict();
const NativeLocalVisionV2Schema = NativeLocalVisionBaseSchema.extend({
  schemaVersion: z.literal("local-vision-v2"),
});
const NativeLocalVisionV3Schema = NativeLocalVisionBaseSchema.extend({
  schemaVersion: z.literal("local-vision-v3"),
  ocrPolicy: z.literal(localVisionOcrPolicy),
  ocrLanguages: z.tuple([z.literal("en-US")]),
});
const NativeLocalVisionV4Schema = NativeLocalVisionBaseSchema.extend({
  schemaVersion: z.literal(localVisionSchemaVersion),
  ocrPolicy: z.literal(localVisionOcrPolicy),
  ocrLanguages: z.tuple([z.literal("en-US")]),
  supplement: NativePackagingSupplementSchema,
});
/** Older pilot binaries remain readable without inventing their unreported OCR settings. */
export const NativeLocalVisionResultSchema = z.discriminatedUnion("schemaVersion", [
  NativeLocalVisionV2Schema,
  NativeLocalVisionV3Schema,
  NativeLocalVisionV4Schema,
]);
export type NativeLocalVisionResult = z.infer<typeof NativeLocalVisionResultSchema>;

/** Visible object kinds only; these are not materials, products or packaging/safety claims. */
export const LocalObjectKindSchema = z.enum(packagingPositiveGroups);
export type LocalObjectKind = z.infer<typeof LocalObjectKindSchema>;

const identifierKinds = new Map<string, LocalObjectKind>([
  ["bottle", "bottle"],
  ["wine_bottle", "bottle"],
  ["jar", "jar"],
  ["carton", "box"],
  ["cardboard_box", "box"],
  ["paper_bag", "bag"],
  ["cup", "cup"],
]);

const SystemObjectGuessSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("estimated"),
      kind: LocalObjectKindSchema,
      matches: z
        .array(
          z
            .object({
              identifier: IdentifierSchema,
              engineScore: z.number().finite().min(0).max(1),
              scoreMeaning: z.literal("class_specific_not_probability"),
            })
            .strict(),
        )
        .min(1)
        .max(localVisionSupportedIdentifiers.length),
    })
    .strict()
    .refine(
      ({ kind, matches }) =>
        new Set(matches.map((match) => match.identifier)).size === matches.length &&
        matches.every((match) => identifierKinds.get(match.identifier) === kind),
    ),
  z
    .object({
      status: z.literal("unknown"),
      reason: z.enum(["no_operating_point_match", "conflicting_kinds"]),
    })
    .strict(),
]);
const MobileClipObjectGuessSchema = z
  .object({
    status: z.literal("estimated"),
    kind: LocalObjectKindSchema,
    method: z.literal("mobileclip-s0"),
    cosine: z.number().finite().min(-1).max(1),
    runnerUpCosine: z.number().finite().min(-1).max(1),
    policy: z.literal(packagingDeployedGate),
    scoreMeaning: z.literal("cosine_similarity_not_probability"),
  })
  .strict()
  .refine(
    (value) =>
      value.cosine >= packagingGatePolicies[packagingDeployedGate].minimumCosine &&
      value.cosine - value.runnerUpCosine >=
        packagingGatePolicies[packagingDeployedGate].minimumLead,
  );
const LocalObjectGuessSchema = z.union([SystemObjectGuessSchema, MobileClipObjectGuessSchema]);
export type LocalObjectGuess = z.infer<typeof LocalObjectGuessSchema>;

const SupplementSourceSchema = z.union([
  PackagingModelSourceSchema.extend({
    status: z.literal("observed"),
    gateVersion: z.literal(packagingGateVersion),
    gate: z.literal(packagingDeployedGate),
  }),
  z
    .object({ status: z.literal("skipped"), reason: z.enum(["primary_match", "primary_conflict"]) })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum(["model_unavailable", "processing_failed"]),
    })
    .strict(),
  z.object({ status: z.literal("legacy_not_reported") }).strict(),
]);

const MarkCandidateSchema = z
  .object({ text: z.string().min(1).max(32), canonicalCode: z.string().min(1).max(32) })
  .strict()
  .refine(({ text, canonicalCode }) => {
    const result = parseLocalMaterialCodeCandidate(text);
    return result?.status === "recognized" && result.canonicalCode === canonicalCode;
  });
export const LocalMaterialMarkingsSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("none"), candidates: z.array(MarkCandidateSchema).length(0) })
    .strict(),
  z
    .object({ status: z.literal("candidates"), candidates: z.array(MarkCandidateSchema).length(1) })
    .strict(),
  z
    .object({
      status: z.literal("ambiguous"),
      reason: z.enum(["conflicting_markers", "multiple_markings", "too_many_markings"]),
      candidates: z.array(MarkCandidateSchema).max(4),
    })
    .strict(),
]);
export type LocalMaterialMarkings = z.infer<typeof LocalMaterialMarkingsSchema>;

export const LocalVisionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("observed"),
      schemaVersion: z.literal(localVisionSchemaVersion),
      source: z
        .object({
          engine: z.literal("apple-vision"),
          method: z.literal("system-classification-and-text-recognition"),
          execution: z.literal("on_device"),
          classificationPolicy: z.literal(localVisionClassificationPolicy),
          minimumPrecision: z.literal(localVisionMinimumPrecision),
          minimumRecall: z.literal(localVisionMinimumRecall),
          classificationRevision: RevisionSchema,
          ocrRevision: z.literal(3),
          ocrLanguages: OcrLanguagesSchema,
          nativeSchemaVersion: z.enum(["local-vision-v2", "local-vision-v3", "local-vision-v4"]),
          ocrPolicy: z.enum(["legacy-unspecified-v2", localVisionOcrPolicy]),
          supplement: SupplementSourceSchema,
          osVersion: OsVersionSchema,
          observedAt: z.iso.datetime(),
          normalizerVersion: z.literal(localVisionNormalizerVersion),
          abstentionVersion: z.literal(localVisionAbstentionVersion),
          verificationStatus: z.literal("inferred"),
        })
        .strict()
        .refine((source) =>
          source.nativeSchemaVersion === "local-vision-v2"
            ? source.ocrPolicy === "legacy-unspecified-v2"
            : source.ocrPolicy === localVisionOcrPolicy &&
              source.ocrLanguages.length === 1 &&
              source.ocrLanguages[0] === "en-US",
        )
        .refine((source) =>
          source.nativeSchemaVersion === "local-vision-v4"
            ? source.supplement.status !== "legacy_not_reported"
            : source.supplement.status === "legacy_not_reported",
        ),
      object: LocalObjectGuessSchema,
      markings: LocalMaterialMarkingsSchema,
      durationMs: z.number().finite().min(0).max(60_000),
    })
    .strict()
    .refine((result) => {
      const extra = result.source.supplement;
      const fromClip = result.object.status === "estimated" && "method" in result.object;
      if (fromClip) return extra.status === "observed";
      if (extra.status === "observed" || extra.status === "unavailable")
        return (
          result.object.status === "unknown" && result.object.reason === "no_operating_point_match"
        );
      if (extra.status === "skipped")
        return extra.reason === "primary_match"
          ? result.object.status === "estimated"
          : result.object.status === "unknown" && result.object.reason === "conflicting_kinds";
      return true;
    }),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "unsupported_platform",
        "native_unavailable",
        "invalid_image",
        "processing_failed",
        "cancelled",
        "invalid_response",
      ]),
    })
    .strict(),
]);
export type LocalVisionResult = z.infer<typeof LocalVisionResultSchema>;
export type LocalVisionObservation = Extract<LocalVisionResult, { status: "observed" }>;

// Only complete, standalone abbreviation + number lines are eligible. In
// particular, never let the domain parser interpret dates/barcodes/bare digits.
const abbreviation = "(?:PET|HDPE|PVC|LDPE|PP|PS|PAP|FE|ALU|FOR|COT|TEX|GL)";
const separator = "(?:\\s+|\\s*[-/]\\s*)?";
const completeMark = new RegExp(
  `^(?:${abbreviation}${separator}\\d{1,2}|\\d{1,2}${separator}${abbreviation}|C\\s*/\\s*${abbreviation}(?:\\s*/\\s*${abbreviation})*${separator}\\d{2})$`,
  "u",
);

/** Returns a parse result for one eligible full marking, never arbitrary OCR prose. */
export function parseLocalMaterialCodeCandidate(
  input: unknown,
): MaterialCodeParseResult | undefined {
  if (typeof input !== "string" || input.length > MATERIAL_CODE_INPUT_MAX_LENGTH) return undefined;
  if (!PlainLineSchema.safeParse(input).success) return undefined;
  const text = normalizeMarkText(input);
  if (!text || text.length > 32 || !completeMark.test(text)) return undefined;
  return parseMaterialIdentificationCode(text);
}

/** Candidates are still unconfirmed OCR observations. No sorting happens here. */
export function extractLocalMaterialCodeCandidates(input: unknown): LocalMaterialMarkings {
  const lines = z.array(PlainLineSchema).max(24).safeParse(input);
  if (!lines.success) return { status: "none", candidates: [] };
  const candidates = new Map<string, { text: string; canonicalCode: string }>();
  let conflict = false;
  for (const line of lines.data) {
    const result = parseLocalMaterialCodeCandidate(line);
    if (!result) continue;
    if (result.status !== "recognized") {
      conflict = true;
      continue;
    }
    if (!candidates.has(result.canonicalCode))
      candidates.set(result.canonicalCode, {
        text: normalizeMarkText(line),
        canonicalCode: result.canonicalCode,
      });
  }
  if (conflict) return { status: "ambiguous", reason: "conflicting_markers", candidates: [] };
  const values = [...candidates.values()];
  if (values.length > 4)
    return { status: "ambiguous", reason: "too_many_markings", candidates: [] };
  if (values.length > 1)
    return { status: "ambiguous", reason: "multiple_markings", candidates: values };
  return values.length === 1
    ? { status: "candidates", candidates: values }
    : { status: "none", candidates: [] };
}

function normalizeMarkText(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/\s+/gu, " ");
}

function normalizeObjectGuess(
  values: NativeLocalVisionResult["classifications"],
): LocalObjectGuess {
  // Vision is multi-label. Scores are class-specific and cannot be ranked,
  // subtracted, or compared with a shared numeric confidence threshold.
  const byIdentifier = new Map(values.map((value) => [value.identifier, value]));
  const matches = localVisionSupportedIdentifiers.flatMap((identifier) => {
    const value = byIdentifier.get(identifier);
    return value?.hasPrecisionRecallCurve && value.passesOperatingPoint
      ? [
          {
            identifier,
            engineScore: value.score,
            scoreMeaning: "class_specific_not_probability" as const,
          },
        ]
      : [];
  });
  const kinds = new Set(matches.map((match) => identifierKinds.get(match.identifier)));
  if (kinds.size === 0) return { status: "unknown", reason: "no_operating_point_match" };
  if (kinds.size > 1) return { status: "unknown", reason: "conflicting_kinds" };
  const first = matches[0];
  const kind = first && identifierKinds.get(first.identifier);
  return kind
    ? { status: "estimated", kind, matches }
    : { status: "unknown", reason: "no_operating_point_match" };
}

/** Independent local observation contract: never masquerade as a server observation. */
export function normalizeLocalVisionResult(input: unknown): LocalVisionResult {
  const parsed = NativeLocalVisionResultSchema.safeParse(input);
  if (!parsed.success) return { status: "unavailable", reason: "invalid_response" };
  const raw = parsed.data;
  const primary = normalizeObjectGuess(raw.classifications);
  let object: LocalObjectGuess = primary;
  let supplement: z.infer<typeof SupplementSourceSchema> = { status: "legacy_not_reported" };
  if (raw.schemaVersion === "local-vision-v4") {
    const extra = raw.supplement;
    if (extra.status === "skipped") {
      const correct =
        extra.reason === "primary_match"
          ? primary.status === "estimated"
          : primary.status === "unknown" && primary.reason === "conflicting_kinds";
      if (!correct) return { status: "unavailable", reason: "invalid_response" };
      supplement = extra;
    } else {
      if (primary.status !== "unknown" || primary.reason !== "no_operating_point_match")
        return { status: "unavailable", reason: "invalid_response" };
      if (extra.status === "unavailable") supplement = extra;
      else {
        const { scores, ...source } = extra;
        supplement = { ...source, gate: packagingDeployedGate, gateVersion: packagingGateVersion };
        const decision = decidePackagingScores(scores, packagingDeployedGate);
        if (decision.status === "estimated")
          object = { ...decision, policy: packagingDeployedGate, method: "mobileclip-s0" };
      }
    }
  }
  const normalized = LocalVisionResultSchema.safeParse({
    status: "observed",
    schemaVersion: localVisionSchemaVersion,
    source: {
      engine: raw.engine,
      method: "system-classification-and-text-recognition",
      execution: "on_device",
      classificationPolicy: raw.classificationPolicy,
      minimumPrecision: raw.minimumPrecision,
      minimumRecall: raw.minimumRecall,
      classificationRevision: raw.classificationRevision,
      ocrRevision: raw.ocrRevision,
      ocrLanguages: raw.ocrLanguages,
      nativeSchemaVersion: raw.schemaVersion,
      ocrPolicy: raw.schemaVersion === "local-vision-v2" ? "legacy-unspecified-v2" : raw.ocrPolicy,
      supplement,
      osVersion: raw.osVersion,
      observedAt: raw.observedAt,
      normalizerVersion: localVisionNormalizerVersion,
      abstentionVersion: localVisionAbstentionVersion,
      verificationStatus: "inferred",
    },
    object,
    markings: extractLocalMaterialCodeCandidates(raw.textLines),
    durationMs: raw.durationMs,
  });
  return normalized.success
    ? normalized.data
    : { status: "unavailable", reason: "invalid_response" };
}
