import { describe, expect, it } from "vitest";
import {
  extractLocalMaterialCodeCandidates,
  LocalMaterialMarkingsSchema,
  LocalVisionResultSchema,
  localVisionAbstentionVersion,
  localVisionClassificationPolicy,
  localVisionMinimumPrecision,
  localVisionMinimumRecall,
  localVisionOcrPolicy,
  localVisionSupportedIdentifiers,
  NativeLocalVisionResultSchema,
  normalizeLocalVisionResult,
  parseLocalMaterialCodeCandidate,
} from "../local-vision";
import { NetworkResultSchema } from "../network-recognition";

type ClassUpdate = {
  identifier: (typeof localVisionSupportedIdentifiers)[number];
  score?: number;
  hasPrecisionRecallCurve?: boolean;
  passesOperatingPoint?: boolean;
};

function classifications(
  updates: readonly ClassUpdate[] = [
    {
      identifier: "bottle",
      score: 0.9,
      hasPrecisionRecallCurve: true,
      passesOperatingPoint: true,
    },
  ],
) {
  return localVisionSupportedIdentifiers.map((identifier) => ({
    identifier,
    score: 0,
    hasPrecisionRecallCurve: false,
    passesOperatingPoint: false,
    ...updates.find((update) => update.identifier === identifier),
  }));
}

function firstClassification(update: Record<string, unknown>) {
  return classifications().map((value, index) => (index === 0 ? { ...value, ...update } : value));
}

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "local-vision-v2",
    engine: "apple-vision",
    classificationPolicy: "apple-class-operating-point-v1",
    minimumPrecision: 0.9,
    minimumRecall: 0.01,
    classificationRevision: 2,
    ocrRevision: 3,
    ocrLanguages: ["en-US", "de-DE", "sv-SE"],
    osVersion: "27.0",
    observedAt: "2026-11-03T10:00:00.000Z",
    classifications: classifications(),
    textLines: [],
    durationMs: 123.5,
    ...overrides,
  };
}

function observation(overrides: Record<string, unknown> = {}) {
  const result = normalizeLocalVisionResult(sample(overrides));
  if (result.status !== "observed") throw new Error("Expected a valid local observation");
  return result;
}

function sampleV3(overrides: Record<string, unknown> = {}) {
  return sample({
    schemaVersion: "local-vision-v3",
    ocrPolicy: localVisionOcrPolicy,
    ocrLanguages: ["en-US"],
    ...overrides,
  });
}

describe("versioned material-lexicon OCR boundary", () => {
  it("records V3 OCR policy separately from unchanged class abstention", () => {
    const raw = sampleV3({ textLines: ["05 PP"] });
    expect(NativeLocalVisionResultSchema.safeParse(raw).success).toBe(true);
    const result = normalizeLocalVisionResult(raw);
    expect(result.status).toBe("observed");
    if (result.status !== "observed") return;
    expect(result.schemaVersion).toBe("local-vision-v4");
    expect(result.source).toMatchObject({
      nativeSchemaVersion: "local-vision-v3",
      ocrPolicy: "material-code-lexicon-v1",
      ocrLanguages: ["en-US"],
      normalizerVersion: "local-vision-normalizer-v4",
      abstentionVersion: "local-vision-abstention-v3",
      verificationStatus: "inferred",
    });
    expect(result.markings.status).toBe("candidates");
    expect(result).not.toHaveProperty("material");
    expect(result).not.toHaveProperty("destination");
  });
  it("accepts native V2 without inventing its unreported OCR policy", () => {
    const result = observation();
    expect(result.schemaVersion).toBe("local-vision-v4");
    expect(result.source.nativeSchemaVersion).toBe("local-vision-v2");
    expect(result.source.ocrPolicy).toBe("legacy-unspecified-v2");
  });
  it("keeps classification and marking decisions unchanged across metadata versions", () => {
    const legacy = observation({ textLines: ["PET 1"] });
    const current = normalizeLocalVisionResult(sampleV3({ textLines: ["PET 1"] }));
    expect(current.status).toBe("observed");
    if (current.status !== "observed") return;
    expect(current.object).toEqual(legacy.object);
    expect(current.markings).toEqual(legacy.markings);
  });
  for (const [name, overrides] of [
    ["missing policy", { ocrPolicy: undefined }],
    ["unknown policy", { ocrPolicy: "free-material-truth" }],
    ["legacy policy on V3", { ocrPolicy: "legacy-unspecified-v2" }],
    ["wrong language", { ocrLanguages: ["sv-SE"] }],
    ["additional language", { ocrLanguages: ["en-US", "de-DE"] }],
    ["unsupported OCR revision", { ocrRevision: 4 }],
    ["dictionary override", { customWords: ["GL"] }],
    ["correction override", { usesLanguageCorrection: false }],
  ] as const) {
    it(`rejects ${name} instead of guessing an OCR configuration`, () => {
      expect(normalizeLocalVisionResult(sampleV3(overrides))).toEqual({
        status: "unavailable",
        reason: "invalid_response",
      });
    });
  }
  it("rejects a policy field on the old strict V2 wire", () => {
    expect(normalizeLocalVisionResult(sample({ ocrPolicy: localVisionOcrPolicy })).status).toBe(
      "unavailable",
    );
  });
  it("rejects a forged normalized policy/native-version combination", () => {
    const result = observation();
    expect(
      LocalVisionResultSchema.safeParse({
        ...result,
        source: { ...result.source, ocrPolicy: localVisionOcrPolicy },
      }).success,
    ).toBe(false);
  });
});

describe("local vision V2 boundary", () => {
  it("records exact Apple class-operating-point policy without claiming measured app precision or custom training", () => {
    const result = observation();
    expect(result.source).toEqual({
      engine: "apple-vision",
      method: "system-classification-and-text-recognition",
      execution: "on_device",
      classificationPolicy: "apple-class-operating-point-v1",
      minimumPrecision: 0.9,
      minimumRecall: 0.01,
      classificationRevision: 2,
      ocrRevision: 3,
      ocrLanguages: ["en-US", "de-DE", "sv-SE"],
      nativeSchemaVersion: "local-vision-v2",
      ocrPolicy: "legacy-unspecified-v2",
      supplement: { status: "legacy_not_reported" },
      osVersion: "27.0",
      observedAt: "2026-11-03T10:00:00.000Z",
      normalizerVersion: "local-vision-normalizer-v4",
      abstentionVersion: "local-vision-abstention-v3",
      verificationStatus: "inferred",
    });
    expect(result.object).toEqual({
      status: "estimated",
      kind: "bottle",
      matches: [
        {
          identifier: "bottle",
          engineScore: 0.9,
          scoreMeaning: "class_specific_not_probability",
        },
      ],
    });
    expect(result.durationMs).toBe(123.5);
    expect(LocalVisionResultSchema.safeParse(result).success).toBe(true);
    expect(NetworkResultSchema.safeParse(result).success).toBe(false);
  });

  it("accepts explicitly reported fallback classification revision 1", () => {
    expect(observation({ classificationRevision: 1 }).source.classificationRevision).toBe(1);
  });

  it("keeps only bounded reviewed markings, not arbitrary OCR text or native response shapes", () => {
    const result = observation({
      textLines: ["person@example.invalid", "Private person's name", "05 PP"],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("person@example.invalid");
    expect(serialized).not.toContain("Private person's name");
    expect(result).not.toHaveProperty("textLines");
    expect(result).not.toHaveProperty("classifications");
    for (const key of ["material", "materialFamily", "risk", "brand", "parts", "destination"])
      expect(result).not.toHaveProperty(key);
    expect(result.markings).toEqual({
      status: "candidates",
      candidates: [{ text: "05 PP", canonicalCode: "PP 5" }],
    });
  });

  it("requires every supported exact label once, including nonpassing or missing-curve records", () => {
    expect(classifications()).toHaveLength(7);
    expect(NativeLocalVisionResultSchema.safeParse(sample()).success).toBe(true);
    const absentCurve = classifications([]);
    expect(observation({ classifications: absentCurve }).object).toEqual({
      status: "unknown",
      reason: "no_operating_point_match",
    });
    for (const incomplete of [
      [],
      classifications().slice(0, 6),
      [...classifications(), classifications()[0]],
      [...classifications().slice(0, 6), classifications()[0]],
    ])
      expect(normalizeLocalVisionResult(sample({ classifications: incomplete }))).toEqual({
        status: "unavailable",
        reason: "invalid_response",
      });
  });

  it("rejects malformed, old-policy, contradictory or unbounded payloads without echoing them", () => {
    const invalid: unknown[] = [
      null,
      "native output",
      sample({ schemaVersion: "local-vision-v1" }),
      sample({ classificationPolicy: "winner-margin-v1" }),
      sample({ minimumPrecision: 0.89 }),
      sample({ minimumRecall: 0.009 }),
      sample({ engine: "openai-vision" }),
      sample({ classificationRevision: 3 }),
      sample({ ocrRevision: 2 }),
      sample({ ocrLanguages: [] }),
      sample({ ocrLanguages: ["en-US", "en-US"] }),
      sample({ ocrLanguages: ["en-US\n"] }),
      sample({ ocrLanguages: ["en-AA", "en-BB", "en-CC", "en-DD", "en-EE", "en-FF"] }),
      sample({ osVersion: "27.0\n" }),
      sample({ observedAt: "yesterday" }),
      sample({ durationMs: Number.NaN }),
      sample({ durationMs: Number.POSITIVE_INFINITY }),
      sample({ durationMs: -1 }),
      sample({ durationMs: 60_001 }),
      sample({ textLines: ["a".repeat(65)] }),
      sample({ textLines: ["PP\u200b5"] }),
      sample({ textLines: ["PP\n5"] }),
      sample({ textLines: Array.from({ length: 25 }, () => "PP 5") }),
      sample({ classifications: firstClassification({ score: Number.NaN }) }),
      sample({ classifications: firstClassification({ score: Number.POSITIVE_INFINITY }) }),
      sample({ classifications: firstClassification({ score: -0.1 }) }),
      sample({ classifications: firstClassification({ score: 1.1 }) }),
      sample({ classifications: firstClassification({ identifier: "x".repeat(81) }) }),
      sample({ classifications: firstClassification({ identifier: "<script>" }) }),
      sample({ classifications: firstClassification({ identifier: "bottle\u202e" }) }),
      sample({
        classifications: firstClassification({
          hasPrecisionRecallCurve: false,
          passesOperatingPoint: true,
        }),
      }),
      sample({ classifications: firstClassification({ hasPrecisionRecallCurve: "true" }) }),
      sample({ classifications: firstClassification({ passesOperatingPoint: "true" }) }),
      sample({ classifications: firstClassification({ material: "glass" }) }),
      sample({ risk: "ordinary_packaging" }),
    ];
    for (const raw of invalid) {
      expect(NativeLocalVisionResultSchema.safeParse(raw).success).toBe(false);
      expect(normalizeLocalVisionResult(raw)).toEqual({
        status: "unavailable",
        reason: "invalid_response",
      });
    }
  });
});

describe("local independent class operating points", () => {
  it.each([
    ["bottle", "bottle"],
    ["wine_bottle", "bottle"],
    ["jar", "jar"],
    ["carton", "box"],
    ["cardboard_box", "box"],
    ["paper_bag", "bag"],
    ["cup", "cup"],
  ] as const)(
    "maps independently passing exact identifier %s to visible kind %s",
    (identifier, kind) => {
      expect(
        observation({
          classifications: classifications([
            {
              identifier,
              score: 0.003,
              hasPrecisionRecallCurve: true,
              passesOperatingPoint: true,
            },
          ]),
        }).object,
      ).toMatchObject({ status: "estimated", kind });
    },
  );

  it.each([
    "can",
    "trash_can",
    "watering_can",
    "container",
    "drinking_glass",
    "raw_glass",
    "extinguisher",
    "newspaper",
    "food",
    "drink",
    "plastic",
    "glass",
    "bottle_cap",
    "constructor",
    "toString",
  ])(
    "does not admit an unsupported taxonomy identifier %s into the fixed reviewed scope",
    (identifier) => {
      expect(
        normalizeLocalVisionResult(
          sample({
            classifications: firstClassification({ identifier }),
          }),
        ),
      ).toEqual({ status: "unavailable", reason: "invalid_response" });
    },
  );

  it("does not use high numeric scores without a passing class operating point", () => {
    expect(
      observation({
        classifications: classifications([
          {
            identifier: "bottle",
            score: 0.999,
            hasPrecisionRecallCurve: true,
            passesOperatingPoint: false,
          },
        ]),
      }).object,
    ).toEqual({ status: "unknown", reason: "no_operating_point_match" });
    expect(
      observation({
        classifications: classifications([
          {
            identifier: "bottle",
            score: 0.999,
            hasPrecisionRecallCurve: false,
            passesOperatingPoint: false,
          },
        ]),
      }).object,
    ).toEqual({ status: "unknown", reason: "no_operating_point_match" });
  });

  it("does not rank/subtract independent scores, require a numeric margin, or veto a valid kind by a nonpassing score", () => {
    const result = observation({
      classifications: classifications([
        {
          identifier: "bottle",
          score: 0.002,
          hasPrecisionRecallCurve: true,
          passesOperatingPoint: true,
        },
        {
          identifier: "jar",
          score: 0.999,
          hasPrecisionRecallCurve: true,
          passesOperatingPoint: false,
        },
        {
          identifier: "cardboard_box",
          score: 0.998,
          hasPrecisionRecallCurve: true,
          passesOperatingPoint: false,
        },
      ]),
    });
    expect(result.object).toEqual({
      status: "estimated",
      kind: "bottle",
      matches: [
        {
          identifier: "bottle",
          engineScore: 0.002,
          scoreMeaning: "class_specific_not_probability",
        },
      ],
    });
    expect(result.object).not.toHaveProperty("engineScore");
  });

  it("abstains for multiple independently passing kinds even when one raw score dwarfs the other", () => {
    expect(
      observation({
        classifications: classifications([
          {
            identifier: "bottle",
            score: 0.99,
            hasPrecisionRecallCurve: true,
            passesOperatingPoint: true,
          },
          {
            identifier: "jar",
            score: 0.001,
            hasPrecisionRecallCurve: true,
            passesOperatingPoint: true,
          },
        ]),
      }).object,
    ).toEqual({ status: "unknown", reason: "conflicting_kinds" });
  });

  it("retains each passing same-kind class score without choosing a maximum or altering native input", () => {
    const raw = sample({
      classifications: classifications([
        {
          identifier: "bottle",
          score: 0.003,
          hasPrecisionRecallCurve: true,
          passesOperatingPoint: true,
        },
        {
          identifier: "wine_bottle",
          score: 0.95,
          hasPrecisionRecallCurve: true,
          passesOperatingPoint: true,
        },
      ]).reverse(),
    });
    const before = structuredClone(raw);
    const result = normalizeLocalVisionResult(raw);
    expect(raw).toEqual(before);
    if (result.status !== "observed") throw new Error("fixture");
    expect(result.object).toEqual({
      status: "estimated",
      kind: "bottle",
      matches: [
        {
          identifier: "bottle",
          engineScore: 0.003,
          scoreMeaning: "class_specific_not_probability",
        },
        {
          identifier: "wine_bottle",
          engineScore: 0.95,
          scoreMeaning: "class_specific_not_probability",
        },
      ],
    });
  });

  it("rejects a fabricated normalized kind or repeated match identifier", () => {
    const valid = observation();
    expect(
      LocalVisionResultSchema.safeParse({
        ...valid,
        object: { ...valid.object, kind: "jar" },
      }).success,
    ).toBe(false);
    if (valid.object.status !== "estimated" || !("matches" in valid.object))
      throw new Error("fixture");
    expect(
      LocalVisionResultSchema.safeParse({
        ...valid,
        object: { ...valid.object, matches: [valid.object.matches[0], valid.object.matches[0]] },
      }).success,
    ).toBe(false);
  });

  it("fixes documented class-curve parameters without calling them measured app quality", () => {
    expect(localVisionAbstentionVersion).toBe("local-vision-abstention-v3");
    expect(localVisionClassificationPolicy).toBe("apple-class-operating-point-v1");
    expect(localVisionMinimumPrecision).toBe(0.9);
    expect(localVisionMinimumRecall).toBe(0.01);
  });
});

describe("local OCR material-mark candidates", () => {
  it("keeps the observed 05 Cyrillic-PP OCR failure unknown rather than silently rewriting scripts", () => {
    // Real synthetic-label OCR output: two U+0420 CYRILLIC CAPITAL LETTER ER characters.
    const observed = "05 \u0420\u0420";
    expect(parseLocalMaterialCodeCandidate(observed)).toBeUndefined();
    expect(extractLocalMaterialCodeCandidates([observed])).toEqual({
      status: "none",
      candidates: [],
    });
  });

  it.each([
    ["05 PP", "PP 5"],
    ["PP5", "PP 5"],
    ["01PET", "PET 1"],
    ["PAP/21", "PAP 21"],
    ["PS-6", "PS 6"],
    ["GL 70", "GL 70"],
    ["c/pap84", "C/PAP 84"],
    ["Ｃ／ＰＡＰ ８４", "C/PAP 84"],
    ["ＰＰ ０５", "PP 5"],
  ])(
    "recognizes only a complete consistent marking %s without sorting it",
    (text, canonicalCode) => {
      expect(parseLocalMaterialCodeCandidate(text)).toMatchObject({
        status: "recognized",
        canonicalCode,
      });
      const markings = extractLocalMaterialCodeCandidates([text]);
      expect(markings.status).toBe("candidates");
      expect(markings.candidates[0]?.canonicalCode).toBe(canonicalCode);
      expect(LocalMaterialMarkingsSchema.safeParse(markings).success).toBe(true);
      expect(markings).not.toHaveProperty("materialFamily");
      expect(markings).not.toHaveProperty("destination");
    },
  );

  it.each([
    "41",
    "05",
    "2026",
    "2026-11-03",
    "3017620422003",
    "PET",
    "PAP",
    "05PP2026",
    "PP 123",
    "PP 5 2026",
    "NET WT 05 PP",
    "made from PP 5",
    "PP////5",
    "PP -- 5",
    "PP 5 PAP 21",
    "PET\u200b1",
    "PP\n5",
    "РР 05",
    "05 PР",
    "XYZ 5",
    "OTHER 7",
    "https://example.invalid/PP5",
  ])("does not convert arbitrary OCR prose, partial marks or embedded/bare numbers %s", (line) => {
    expect(parseLocalMaterialCodeCandidate(line)).toBeUndefined();
    expect(extractLocalMaterialCodeCandidates([line])).toEqual({ status: "none", candidates: [] });
  });

  it("retains domain ambiguity without inventing a corrected OCR candidate", () => {
    expect(parseLocalMaterialCodeCandidate("PET 41")).toMatchObject({
      status: "ambiguous",
      reason: "conflicting_markers",
    });
    expect(extractLocalMaterialCodeCandidates(["PP 5", "PET 41"])).toEqual({
      status: "ambiguous",
      reason: "conflicting_markers",
      candidates: [],
    });
    expect(extractLocalMaterialCodeCandidates(["PP 7"])).toEqual({
      status: "ambiguous",
      reason: "conflicting_markers",
      candidates: [],
    });
  });

  it("deduplicates the same canonical marking without merging separate different codes", () => {
    expect(extractLocalMaterialCodeCandidates(["05 PP", "PP5", "PP 05"])).toEqual({
      status: "candidates",
      candidates: [{ text: "05 PP", canonicalCode: "PP 5" }],
    });
    expect(extractLocalMaterialCodeCandidates(["PP5", "PAP21"])).toEqual({
      status: "ambiguous",
      reason: "multiple_markings",
      candidates: [
        { text: "PP5", canonicalCode: "PP 5" },
        { text: "PAP21", canonicalCode: "PAP 21" },
      ],
    });
  });

  it("abstains rather than silently selecting among too many distinct markings", () => {
    expect(extractLocalMaterialCodeCandidates(["PP5", "PET1", "PAP21", "ALU41", "GL70"])).toEqual({
      status: "ambiguous",
      reason: "too_many_markings",
      candidates: [],
    });
  });

  it("bounds helper input and rejects fabricated normalized candidate mappings", () => {
    expect(parseLocalMaterialCodeCandidate("A".repeat(65))).toBeUndefined();
    expect(parseLocalMaterialCodeCandidate(5)).toBeUndefined();
    expect(extractLocalMaterialCodeCandidates("PP 5")).toEqual({ status: "none", candidates: [] });
    expect(extractLocalMaterialCodeCandidates(Array.from({ length: 25 }, () => "PP5"))).toEqual({
      status: "none",
      candidates: [],
    });
    for (const candidate of [
      { text: "Private person's name", canonicalCode: "PP 5" },
      { text: "PP5", canonicalCode: "ALU 41" },
    ])
      expect(
        LocalMaterialMarkingsSchema.safeParse({ status: "candidates", candidates: [candidate] })
          .success,
      ).toBe(false);
  });
});
