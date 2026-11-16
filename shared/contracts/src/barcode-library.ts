import { GtinSchema } from "@kierratysappi/domain";
import { z } from "zod";
const text = z
  .string()
  .min(1)
  .max(240)
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v));
export const BarcodeLibrarySchema = z
  .object({
    schema: z.literal("off-finland-barcode-v1"),
    checkedAt: z.iso.date(),
    source: z
      .object({
        name: z.literal("Open Food Facts contributors"),
        licence: z.literal("ODbL-1.0 / DbCL-1.0"),
        url: z.literal("https://world.openfoodfacts.org"),
        scope: z.literal("source-tagged-sold-in-finland-not-complete-market"),
      })
      .strict(),
    products: z
      .array(
        z
          .object({
            gtin: GtinSchema,
            name: text,
            names: z.object({ fi: text.optional(), en: text.optional() }).strict(),
            brands: text.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export type BarcodeLibrary = z.infer<typeof BarcodeLibrarySchema>;
