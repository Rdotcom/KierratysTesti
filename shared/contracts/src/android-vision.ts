import { parseGtin } from "@kierratysappi/domain";
import { z } from "zod";
import { extractLocalMaterialCodeCandidates } from "./local-vision";

export const AndroidVisionEvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal("android-local-evidence-v1"),
    engine: z.literal("mlkit-bundled-latin-v1"),
    observedAt: z.iso.datetime(),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    codes: z.array(z.string().regex(/^[0-9]{8,14}$/u)).max(8),
    markings: z
      .array(
        z
          .string()
          .max(64)
          .regex(/^[^\p{Cc}\p{Cf}]*$/u),
      )
      .max(24),
  })
  .refine((v) => v.width * v.height <= 8_000_000);
export function normalizeAndroidVisionEvidence(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 8192) throw Error("invalid_android_evidence");
  const data = AndroidVisionEvidenceSchema.parse(JSON.parse(raw));
  return {
    codes: [
      ...new Set(
        data.codes.flatMap((code) => {
          const result = parseGtin(code);
          return result.ok ? [result.value] : [];
        }),
      ),
    ],
    markings: extractLocalMaterialCodeCandidates(data.markings),
    source: {
      engine: data.engine,
      observedAt: data.observedAt,
      verification: "unverified" as const,
      scope: "codes_only" as const,
    },
  };
}
export type AndroidVisionEvidence = ReturnType<typeof normalizeAndroidVisionEvidence>;
