import { OfflineVectorSchema, offlineEncoder } from "@kierratysappi/domain/offline-product";
import { z } from "zod";

const view = z.strictObject({
  view: z.enum(["full", "center"]),
  complete: z.boolean(),
  lines: z
    .array(
      z.strictObject({
        text: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[^\p{Cc}\p{Cf}]+$/u),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(48),
});
export const OfflineProductEvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal("offline-product-evidence-v1"),
    imageSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    barcodeComplete: z.boolean(),
    barcodes: z
      .array(
        z.strictObject({
          symbology: z.enum([
            "VNBarcodeSymbologyEAN13",
            "VNBarcodeSymbologyEAN8",
            "VNBarcodeSymbologyITF14",
          ]),
          value: z.string().max(64),
        }),
      )
      .max(8),
    ocrLanguages: z
      .array(z.enum(["fi-FI", "sv-SE", "en-US"]))
      .min(1)
      .max(3),
    ocrPolicy: z.literal("accurate-v3-no-correction-full-and-center-v1"),
    ocr: z.tuple([view, view]).refine(([a, b]) => a.view === "full" && b.view === "center"),
    detailRoi: z.tuple([z.literal(0.1), z.literal(0.1), z.literal(0.8), z.literal(0.8)]),
    embedding: z.discriminatedUnion("status", [
      z.strictObject({
        status: z.literal("observed"),
        encoderSha256: z.literal(offlineEncoder.encoderSha256),
        preprocessingSha256: z.literal(offlineEncoder.preprocessingSha256),
        vector: OfflineVectorSchema,
      }),
      z.strictObject({ status: z.literal("unavailable") }),
      z.strictObject({ status: z.literal("skipped_barcode") }),
    ]),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    durationMs: z.number().int().min(0).max(12000),
  })
  .refine(
    (e) =>
      e.width * e.height <= 16000000 &&
      (e.embedding.status !== "skipped_barcode" || e.barcodes.length > 0),
  );
export type OfflineProductEvidence = z.infer<typeof OfflineProductEvidenceSchema>;
